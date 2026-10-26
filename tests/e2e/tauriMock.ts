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
  const library: { id: unknown; version: unknown }[] = []
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
    library_list: () => library,
    library_pick_pack: () => null,
    library_install_commit: () => fail("invalidInput", "Nothing is waiting to be installed."),
    library_install_cancel: () => null,
    library_remove: (args) => {
      const at = library.findIndex((c) => c.id === args.id && c.version === args.version)
      if (at >= 0) library.splice(at, 1)
      return library
    },
    library_copy_into_project: () => 0,
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
  w.__E2E_MOCK__ = { commands, emit, fail, assets, textures }
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
  exports(): { name: string; size: number; head: number[] }[]
}
