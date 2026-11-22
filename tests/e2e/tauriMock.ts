/**
 * Replaces the Tauri backend before the app loads (the browser equivalent of `mockIPC`).
 * Runs in the page, so it must be self-contained (no imports, no outer variables).
 * - `app_info` answers like the real Rust command; project commands live in
 *   `tauriProjectMock.ts`, installed after this script into the same command table.
 * - An in-memory file system stands in for the import/export commands: tests queue picked or
 *   dropped files, assets written by the app are served back through `convertFileSrc` as blob
 *   URLs, and exports are kept for inspection (see `E2EBackend`).
 * - Every call is recorded.
 */
export function installTauriMockScript(): void {
  type Picked = { token: string; name: string; size: number }
  const w = window as unknown as Record<string, unknown>
  const calls: string[] = []
  const files = new Map<string, { name: string; bytes: Uint8Array }>()
  const resources = new Map<string, Uint8Array>()
  const assets = new Map<string, Uint8Array<ArrayBuffer>>()
  const textures = new Map<string, { ext: string; bytes: Uint8Array<ArrayBuffer> }>()
  let nextTexture: { name: string; base64: string } | null = null
  const urls = new Map<string, string>()
  const exports = new Map<string, { name: string; bytes: Uint8Array }>()
  type Staged = {
    token: string
    components: { id: string; version: string; manifestSha256: string; manifest: string }[]
    files: number
    bytes: number
    verified: boolean
  }
  const library: Record<string, unknown>[] = []
  const licenses = new Set<string>()
  let nextPack: Staged | null = null
  let staged: Staged | null = null
  const listeners = new Map<string, { eventId: number; handler: number }[]>()
  let nextPick: Picked[] = []
  let counter = 0
  let callbackId = 0

  const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const register = (name: string, base64: string): Picked => {
    const bytes = decode(base64)
    const token = `f${++counter}`
    files.set(token, { name, bytes })
    return { token, name, size: bytes.byteLength }
  }
  const fail = (kind: string, message: string) =>
    // Tauri rejects with the serialized Rust AppError object, not an Error instance.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    Promise.reject({ kind, message })
  const emit = (event: string, payload: unknown) => {
    for (const { eventId, handler } of listeners.get(event) ?? []) {
      const callback = w[`_${handler}`] as ((e: unknown) => void) | undefined
      callback?.({ event, id: eventId, payload })
    }
  }
  const hex = (buffer: ArrayBuffer) =>
    Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("")

  w.__E2E__ = {
    calls,
    queuePick: (list: { name: string; base64: string }[]) => {
      nextPick = list.map((f) => register(f.name, f.base64))
    },
    addResource: (name: string, base64: string) => resources.set(name, decode(base64)),
    drop: (list: { name: string; base64: string }[], skipped: string[] = []) =>
      emit("import-drop", { files: list.map((f) => register(f.name, f.base64)), skipped }),
    assetIds: () => [...assets.keys()],
    queueTexture: (file: { name: string; base64: string }) => {
      nextTexture = file
    },
    textureIds: () => [...textures.keys()],
    /** The next Install from file picks a pack holding these component.json texts. */
    queuePack: (manifests: { id: string; version: string; manifest: string }[]) => {
      nextPack = {
        token: `p${++counter}`,
        components: manifests.map((m) => ({ ...m, manifestSha256: "0".repeat(64) })),
        files: manifests.length,
        bytes: manifests.reduce((n, m) => n + m.manifest.length, 0),
        verified: false,
      }
    },
    libraryIds: () => library.map((c) => `${String(c.id)}@${String(c.version)}`),
    /** An empty library folder, as on another machine. */
    clearLibrary: () => library.splice(0),
    /** A written export (or its credits sidecar) as text; null when there is none. */
    exportText: (name: string) => {
      const found = [...exports.values()].find((e) => e.name === name)
      return found ? Array.from(found.bytes, (b) => String.fromCharCode(b)).join("") : null
    },
    exports: () =>
      [...exports.values()].map((e) => ({
        name: e.name,
        size: e.bytes.byteLength,
        head: Array.from(e.bytes.slice(0, 84)),
      })),
  }

  type Args = Record<string, unknown> & Uint8Array
  const commands: Record<string, (args: Args, headers: Record<string, string>) => unknown> = {
    app_info: () => ({
      name: "StudioVD",
      version: "0.1.0",
      tauriVersion: "2.e2e",
      os: "e2e-os",
      arch: "e2e-arch",
    }),
    pick_import_files: () => {
      const files = nextPick
      nextPick = []
      return { files, skipped: [] }
    },
    read_import_file: (args) => {
      const file = files.get(String(args.token))
      return file ? file.bytes.slice().buffer : fail("invalidInput", "Unknown file token.")
    },
    read_import_resource: (args) => {
      const bytes = resources.get(String(args.relative))
      return bytes
        ? bytes.slice().buffer
        : fail("invalidInput", `'${String(args.relative)}' is not a file next to the model.`)
    },
    write_asset: async (args, headers) => {
      const id = headers["x-asset-id"] ?? ""
      const bytes = new Uint8Array(args)
      if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== id)
        return fail("invalidInput", `Asset ${id} does not match its content.`)
      const existed = assets.has(id)
      assets.set(id, bytes.slice())
      return !existed
    },
    import_texture: async () => {
      const chosen = nextTexture
      nextTexture = null
      if (!chosen) return null // cancelled
      const bytes = decode(chosen.base64)
      const png = bytes[0] === 0x89 && bytes[1] === 0x50
      const jpg = bytes[0] === 0xff && bytes[1] === 0xd8
      if (!png && !jpg) return fail("invalidInput", "Only PNG and JPEG images can be used.")
      const id = hex(await crypto.subtle.digest("SHA-256", bytes))
      const ext = png ? "png" : "jpg"
      textures.set(id, { ext, bytes: bytes.slice() })
      return { id, ext, name: chosen.name, width: 0, height: 0 }
    },
    // The component library (src/lib/tauri/library.ts): empty unless a test installs into it.
    // Copies, as IPC deserializes a fresh array every time.
    library_list: () => [...library],
    library_pick_pack: () => {
      staged = nextPack
      nextPack = null
      return staged
    },
    library_install_commit: (args) => {
      if (!staged || staged.token !== args.token)
        return fail("invalidInput", "Nothing is waiting to be installed.")
      for (const c of staged.components)
        library.push({ ...c, origin: "sideloaded", verified: false })
      staged = null
      return [...library]
    },
    library_install_cancel: () => {
      staged = null
      return null
    },
    library_remove: (args) => {
      const at = library.findIndex((c) => c.id === args.id && c.version === args.version)
      if (at >= 0) library.splice(at, 1)
      return [...library]
    },
    // Insertion copies the component's licence texts into the workspace, as Rust does
    // (its geometry is whatever the test put into the asset store).
    library_copy_into_project: (args) => {
      const found = library.find((c) => c.id === args.id && c.version === args.version)
      const text = typeof found?.manifest === "string" ? found.manifest : ""
      const named = text.match(/licenses\/[0-9a-f]{64}\.txt/g) ?? []
      const fresh = named.filter((name) => !licenses.has(name))
      for (const name of fresh) licenses.add(name)
      return fresh.length
    },
    // Convex decomposition: one piece, the mesh's bounding box (Rust's V-HACD is tested there).
    decompose_mesh: (args) => {
      const view = new DataView(new Uint8Array(args).slice().buffer)
      const vertices = view.getUint32(0, true)
      const [lo, hi] = [
        [Infinity, Infinity, Infinity],
        [-Infinity, -Infinity, -Infinity],
      ]
      for (let v = 0; v < vertices; v++)
        for (let k = 0; k < 3; k++) {
          const c = view.getFloat32(8 + 12 * v + 4 * k, true)
          lo[k] = Math.min(lo[k] ?? c, c)
          hi[k] = Math.max(hi[k] ?? c, c)
        }
      const out = new DataView(new ArrayBuffer(4 + 4 + 8 * 12))
      out.setUint32(0, 1, true)
      out.setUint32(4, 8, true)
      for (let i = 0; i < 8; i++)
        for (let k = 0; k < 3; k++)
          out.setFloat32(8 + 12 * i + 4 * k, ((i >> k) & 1 ? hi[k] : lo[k]) ?? 0, true)
      calls.push("decompose_mesh:done")
      return out.buffer
    },
    library_user_namespace: () => "u-e2etst",
    library_project_geometry_sizes: (args) => {
      const names = args.files as string[]
      const sizes = names.map((n) => assets.get(n.slice(9, 73))?.byteLength)
      return sizes.every((n) => n !== undefined)
        ? sizes
        : fail("invalidInput", "The project no longer holds a file.")
    },
    // Save as component / Add to my library: the manifest as Rust would record it.
    library_add_from_project: async (args) => {
      const text = String(args.manifest)
      const parsed = JSON.parse(text) as { identity: { id: string; version: string } }
      const { id, version } = parsed.identity
      const sha = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))
      const existing = library.find((c) => c.id === id && c.version === version)
      if (existing && existing.manifestSha256 !== sha)
        return fail(
          "invalidInput",
          `${id} ${version} is already in your library with other content.`
        )
      if (!existing) {
        const origin = id.startsWith("u-e2etst/") ? "user" : "sideloaded"
        library.push({ id, version, manifestSha256: sha, origin, verified: false, manifest: text })
      }
      return [...library]
    },
    library_export_pack: (args) => {
      const list = args.components as { id: string; version: string }[]
      const name = `${String(args.suggestedName)}.stvdpack`
      exports.set(`x${++counter}`, { name, bytes: new TextEncoder().encode(JSON.stringify(list)) })
      return { components: list.length, files: list.length, bytes: 0 }
    },
    pick_export_path: (args) => {
      const token = `x${++counter}`
      const name = `${String(args.suggestedName)}.${String(args.format)}`
      exports.set(token, { name, bytes: new Uint8Array() })
      return { token, name, size: 0 }
    },
    write_export: (args, headers) => {
      const target = exports.get(headers["x-export-token"] ?? "")
      if (!target) return fail("invalidInput", "Unknown file token.")
      target.bytes = new Uint8Array(args).slice()
      return null
    },
    write_export_credits: (args, headers) => {
      const target = exports.get(headers["x-export-token"] ?? "")
      if (!target?.name.toLowerCase().endsWith(".stl"))
        return fail("invalidInput", "Only an STL export has a credits file.")
      const name = `${target.name.slice(0, -4)}.credits.txt`
      exports.set(`credits:${name}`, { name, bytes: new Uint8Array(args).slice() })
      return name
    },
    "plugin:event|listen": (args) => {
      const event = String(args.event)
      const eventId = ++counter
      listeners.set(event, [
        ...(listeners.get(event) ?? []),
        { eventId, handler: Number(args.handler) },
      ])
      return eventId
    },
    "plugin:event|unlisten": (args) => {
      const event = String(args.event)
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((l) => l.eventId !== args.eventId)
      )
      return null
    },
  }

  // Shared with tauriProjectMock.ts (a second init script): commands, events and files.
  w.__E2E_MOCK__ = { commands, emit, fail, assets, textures, licenses, library }
  w.isTauri = true
  w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined }
  w.__TAURI_INTERNALS__ = {
    invoke: (cmd: string, args: Args, options?: { headers?: Record<string, string> }) => {
      calls.push(cmd)
      const command = commands[cmd]
      return Promise.resolve(command ? command(args, options?.headers ?? {}) : null)
    },
    convertFileSrc: (path: string) => {
      const [, id = "", ext = ""] = /([0-9a-f]{64})\.(glb|png|jpg)$/.exec(path) ?? []
      let url = urls.get(`${id}.${ext}`)
      if (!url) {
        const texture = ext === "glb" ? undefined : textures.get(id)
        const bytes = ext === "glb" ? assets.get(id) : texture?.ext === ext ? texture.bytes : null
        const type =
          ext === "glb" ? "model/gltf-binary" : ext === "png" ? "image/png" : "image/jpeg"
        url = URL.createObjectURL(new Blob(bytes ? [bytes] : [], { type }))
        if (bytes) urls.set(`${id}.${ext}`, url)
      }
      return url
    },
    transformCallback: (callback: unknown) => {
      callbackId += 1
      w[`_${callbackId}`] = callback
      return callbackId
    },
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { windowLabel: "main", label: "main" },
    },
  }
}

/** What tests read back from the mocked backend (`window.__E2E__`). */
export interface E2EBackend {
  calls: string[]
  queuePick(files: { name: string; base64: string }[]): void
  addResource(name: string, base64: string): void
  drop(files: { name: string; base64: string }[], skipped?: string[]): void
  assetIds(): string[]
  /** The next Choose Image picks this file (none queued: the dialog is cancelled). */
  queueTexture(file: { name: string; base64: string }): void
  textureIds(): string[]
  queuePack(manifests: { id: string; version: string; manifest: string }[]): void
  libraryIds(): string[]
  clearLibrary(): void
  exportText(name: string): string | null
  exports(): { name: string; size: number; head: number[] }[]
}
