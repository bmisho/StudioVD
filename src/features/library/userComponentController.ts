import type { InstalledRecord } from "@/core/library/items"
import { buildUserComponent, type UserComponentForm } from "@/core/library/userComponent/build"
import { saveDefaults, savedVersions } from "@/core/library/userComponent/defaults"
import { slugFor } from "@/core/library/userComponent/keys"
import { planUserComponent } from "@/core/library/userComponent/plan"
import { exportRefusal } from "@/core/library/userComponent/version"
import {
  RESERVED_NAMESPACES,
  namespaceOf,
  readManifest,
  type ComponentInstanceId,
  type ComponentManifest,
  type PartId,
} from "@/core/schema"
import type { Notifier } from "@/lib/notify"
import type { ExportSummary, LibraryEntry } from "@/lib/tauri/library"
import type { Result } from "@/lib/tauri/result"
import type { DocumentStore } from "@/store/document/documentStore"
import type { LibraryStore } from "@/store/session/libraryStore"

export interface UserComponentBackend {
  userNamespace: () => Promise<Result<string>>
  projectGeometrySizes: (files: string[]) => Promise<Result<number[]>>
  addFromProject: (manifest: string) => Promise<Result<LibraryEntry[]>>
  exportPack: (
    components: { id: string; version: string }[],
    suggestedName: string
  ) => Promise<Result<ExportSummary | null>>
}

const text = (m: ComponentManifest) => `${JSON.stringify(m, null, 2)}\n`

/**
 * Save as component, Add to my library and Export pack (PLAN 9.7). The manifest is built and
 * validated here (core), Rust checks and stores the files it names; nothing about the
 * document changes, so there is nothing to undo.
 */
export function createUserComponentController(deps: {
  backend: UserComponentBackend
  document: DocumentStore
  library: LibraryStore
  notify: Notifier
  appVersion: string
  now: () => Date
}) {
  const { backend, document, library, notify } = deps
  let namespace: string | null = null
  const ns = async (): Promise<string | null> => {
    if (namespace) return namespace
    const got = await backend.userNamespace()
    if (!got.ok) notify.error("The library cannot be reached", got.error.message)
    else namespace = got.value
    return namespace
  }
  const versionsOf = (id: string) =>
    savedVersions(library.getState().installed, id, deps.appVersion).versions

  return {
    /** Edit › Save as Component…: opens the dialog for these parts. */
    async open(partIds: readonly PartId[]): Promise<void> {
      const { doc } = document.getState()
      const plan = planUserComponent(doc, partIds)
      if (typeof plan === "string") return notify.info(plan)
      const space = await ns()
      if (!space) return
      const { installed } = library.getState()
      const { form, inherited } = saveDefaults(doc, plan, space, installed, deps.appVersion)
      library.getState().setSave({
        phase: "edit",
        partIds: plan.parts.map((p) => p.id),
        defaults: form,
        namespace: space,
        summary: {
          parts: plan.parts.length,
          anchors: plan.anchors.length,
          mates: plan.mates.length,
          ...plan.skipped,
          inherited,
        },
        error: null,
      })
    },
    /** Versions of `slug` already saved (the dialog refuses to reuse one). */
    takenVersions: (slug: string): string[] =>
      namespace ? versionsOf(`${namespace}/${slug}`) : [],
    cancel: () => library.getState().setSave({ phase: "idle" }),
    async save(form: UserComponentForm): Promise<void> {
      const state = library.getState().save
      if (state.phase !== "edit") return
      const space = state.namespace
      const fail = (error: string) => library.getState().setSave({ ...state, phase: "edit", error })
      library.getState().setSave({ ...state, phase: "saving", error: null })
      const { doc } = document.getState()
      const plan = planUserComponent(doc, state.partIds)
      if (typeof plan === "string") return fail(plan)
      const assets = [...new Set(plan.parts.map((p) => p.assetId))]
      const sizes = await backend.projectGeometrySizes(assets.map((id) => `geometry/${id}.glb`))
      if (!sizes.ok) return fail(sizes.error.message)
      const glbBytes = new Map(assets.map((id, i) => [id as string, sizes.value[i] ?? 0]))
      const createdAt = deps
        .now()
        .toISOString()
        .replace(/\.\d+Z$/, "Z")
      const ctx = { namespace: space, appVersion: deps.appVersion, createdAt, glbBytes }
      const built = buildUserComponent(doc, plan, form, ctx)
      if ("error" in built) return fail(built.error)
      const added = await backend.addFromProject(text(built.manifest))
      if (!added.ok) return fail(added.error.message)
      library.getState().setInstalled(added.value)
      library.getState().setSave({ phase: "idle" })
      notify.success(`Saved ${built.manifest.identity.name} to My components`)
    },
    /** Add to my library: a component this project holds that the library lacks. */
    async harvest(instanceId: ComponentInstanceId): Promise<void> {
      const { doc } = document.getState()
      const instance = Object.hasOwn(doc.components, instanceId)
        ? doc.components[instanceId]
        : undefined
      const def = instance?.def ? doc.componentDefs[instance.def] : undefined
      if (!def || def.origin === "generator") return
      const { name } = def.manifest.identity
      if (RESERVED_NAMESPACES.has(namespaceOf(def.id)))
        return notify.info(`${name} can only be installed from the signed catalog.`)
      if (versionsOf(def.id).includes(def.version))
        return notify.info(`${name} ${def.version} is already in your library.`)
      if (!(await ns())) return
      const added = await backend.addFromProject(text({ ...def.manifest, thumbnails: [] }))
      if (!added.ok) return notify.error(`${name} was not added`, added.error.message)
      library.getState().setInstalled(added.value)
      const mine = namespaceOf(def.id) === namespace
      notify.success(
        `Added ${name} to your library`,
        mine ? undefined : "Marked Unverified: no catalogue vouches for it."
      )
    },
    /** Export pack… for an installed component. */
    async exportPack(record: InstalledRecord): Promise<void> {
      const read = readManifest(
        new TextEncoder().encode(record.manifest),
        deps.appVersion,
        record.origin === "official"
      )
      if (!read.ok)
        return notify.error(
          "This component cannot be exported",
          read.reason === "newer" ? `It needs StudioVD ${read.needs}.` : read.message
        )
      const own = record.origin === "user"
      const refusal = exportRefusal(read.manifest, own)
      const { name } = read.manifest.identity
      if (refusal) return notify.error(`${name} cannot be exported`, refusal)
      const done = await backend.exportPack(
        [{ id: record.id, version: record.version }],
        slugFor(name)
      )
      if (!done.ok) return notify.error("The pack was not written", done.error.message)
      if (!done.value) return
      const closed = own && !read.manifest.license.geometry.redistributable
      notify.success(
        `Exported ${name}`,
        closed
          ? "All rights reserved: whoever you send it to may use it, not pass it on."
          : undefined
      )
    },
  }
}

export type UserComponentController = ReturnType<typeof createUserComponentController>
