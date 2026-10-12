import { buildImportBatch, type ImportedFile } from "@/core/import/importBatch"
import { gltfBufferUris, objMaterialLibraries } from "@/core/import/externalRefs"
import { formatOf, type ImportOptions } from "@/core/import/importOptions"
import { triangleBudgetWarning } from "@/core/import/triangleBudget"
import type { Notifier } from "@/lib/notify"
import type { PickedFile } from "@/lib/tauri/files"
import type { Result } from "@/lib/tauri/result"
import type { DocumentStore } from "@/store/document/documentStore"
import type { ImportStore } from "@/store/session/importStore"
import type { SessionStore } from "@/store/session/sessionStore"
import type { RunningImport } from "./importClient"
import type { ImportJob, Progress } from "./runImport"

export interface ImportBackend {
  readImportFile: (token: string) => Promise<Result<ArrayBuffer>>
  readImportResource: (token: string, relative: string) => Promise<Result<ArrayBuffer>>
  writeAsset: (id: string, bytes: Uint8Array) => Promise<Result<boolean>>
}

export interface ImportDeps {
  backend: ImportBackend
  runJob: (job: ImportJob, onProgress: Progress) => RunningImport
  document: DocumentStore
  session: SessionStore
  imports: ImportStore
  fitAll: () => void
  notify: Notifier
}

const unwrap = async <T>(result: Promise<Result<T>>): Promise<T> => {
  const r = await result
  if (!r.ok) throw new Error(r.error.message)
  return r.value
}
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** glTF JSON is parsed whole on this thread; bigger files should be .glb (Rust: same cap). */
const MAX_GLTF_JSON_BYTES = 256 * 1024 * 1024
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
const lines = (items: string[], max = 6) =>
  items.length <= max
    ? items.join("\n")
    : [...items.slice(0, max), `…and ${items.length - max} more`].join("\n")

/**
 * Runs the import dialog's job (PLAN 4.2-4.6): reads each file through its token, parses and
 * normalizes it in a worker, stores the assets, then inserts everything as ONE undo entry.
 * Cancelling inserts nothing; a failed file is reported and the others still import.
 */
export function createImportController(deps: ImportDeps) {
  let current: RunningImport | null = null
  let cancelled = false
  // Cancel may come while files are still being read, before any worker exists to terminate.
  const stopIfCancelled = () => {
    if (cancelled) throw new DOMException("Import cancelled.", "AbortError")
  }

  async function jobFor(file: PickedFile, options: ImportOptions, warnings: string[]) {
    const format = formatOf(file.name)
    if (!format) throw new Error("This file type cannot be imported.")
    const bytes = await unwrap(deps.backend.readImportFile(file.token))
    stopIfCancelled()
    const job: ImportJob = { fileName: file.name, format, bytes, options }
    if (format === "obj") {
      const texts: string[] = []
      for (const name of objMaterialLibraries(new Uint8Array(bytes))) {
        const r = await deps.backend.readImportResource(file.token, name)
        stopIfCancelled()
        if (r.ok) texts.push(new TextDecoder().decode(r.value))
        else warnings.push(`${file.name}: material library ${name} not found, colours skipped.`)
      }
      if (texts.length > 0) job.mtlText = texts.join("\n")
    } else if (format === "gltf") {
      if (bytes.byteLength > MAX_GLTF_JSON_BYTES)
        throw new Error("This .gltf is over 256 MB of JSON; convert it to .glb to import it.")
      const resources: Record<string, ArrayBuffer> = {}
      const json: unknown = JSON.parse(new TextDecoder().decode(bytes))
      for (const uri of gltfBufferUris(json)) {
        resources[uri] = await unwrap(deps.backend.readImportResource(file.token, uri))
        stopIfCancelled()
      }
      job.resources = resources
    }
    return job
  }

  async function importFile(
    file: PickedFile,
    index: number,
    options: ImportOptions,
    written: Set<string>
  ) {
    const report = (stage: string, fraction: number) =>
      deps.imports
        .getState()
        .setProgress({ fileIndex: index, fileName: file.name, stage, fraction })
    report("Reading", 0)
    const warnings: string[] = []
    const job = await jobFor(file, options, warnings)
    stopIfCancelled()
    current = deps.runJob(job, (done, total, stage) => report(stage, total > 0 ? done / total : 0))
    const outcome = await current.result
    current = null
    report("Saving", 1)
    // Identical meshes (N equal screws) share one content address: send each once.
    const known = deps.document.getState().doc.assets
    for (const part of outcome.parts) {
      stopIfCancelled()
      const id = part.asset.id
      if (Object.hasOwn(known, id) || written.has(id)) continue
      await unwrap(deps.backend.writeAsset(id, part.asset.glb))
      written.add(id)
    }
    const imported: ImportedFile = {
      fileName: file.name,
      parts: outcome.parts.map(({ name, path, asset: { glb, name: assetName, ...asset } }) => {
        void glb // stored above; the document keeps only the asset's summary
        void assetName
        return { name, path, asset }
      }),
    }
    return { imported, warnings: [...warnings, ...outcome.warnings] }
  }

  function commit(files: ImportedFile[], warnings: string[], errors: string[]) {
    const doc = deps.document.getState().doc
    const batch = buildImportBatch(doc, files)
    if (batch.parts.length > 0) {
      const budget = triangleBudgetWarning(doc, batch)
      if (budget) warnings.push(budget)
      try {
        deps.document.getState().insertEntities(batch)
      } catch (e) {
        // The project limits (parts, group depth) apply to imports too (PLAN 5.1).
        deps.notify.error("The import could not be added", errorText(e))
        return
      }
      // New parts would be invisible under View › Isolate: show everything again.
      if (deps.session.getState().isolated) deps.session.getState().toggleIsolation([])
      deps.session.getState().select(batch.topLevel)
      deps.fitAll()
      const fileCount = files.filter((f) => f.parts.length > 0).length
      deps.notify.success(
        `Imported ${plural(batch.parts.length, "part")} from ${plural(fileCount, "file")}`
      )
    }
    if (warnings.length > 0) deps.notify.warning("Import warnings", lines(warnings))
    if (errors.length > 0) deps.notify.error("Some files could not be imported", lines(errors))
  }

  return {
    /** Imports the files in the open dialog with its options. */
    async run(): Promise<void> {
      const files = deps.imports.getState().start()
      if (!files) return
      const options = deps.imports.getState().options
      cancelled = false
      const done: ImportedFile[] = []
      const written = new Set<string>()
      const warnings: string[] = []
      const errors: string[] = []
      try {
        for (const [index, file] of files.entries()) {
          if (cancelled) break
          try {
            const result = await importFile(file, index, options, written)
            done.push(result.imported)
            warnings.push(...result.warnings)
          } catch (e) {
            if (!cancelled) errors.push(`${file.name}: ${errorText(e)}`)
          }
        }
        if (cancelled) deps.notify.info("Import cancelled", "Nothing was added.")
        else commit(done, warnings, errors)
      } finally {
        current = null
        deps.imports.getState().close()
      }
    },
    /** Stops the running import; nothing is inserted. */
    cancel(): void {
      cancelled = true
      current?.cancel()
    },
  }
}

export type ImportController = ReturnType<typeof createImportController>
