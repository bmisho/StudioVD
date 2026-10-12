/**
 * Project commands for the E2E Tauri mock (installed after `installTauriMockScript`, into its
 * command table). Self-contained, like that script. A "disk" of saved projects keeps each
 * scene.json; geometry stays in the shared asset store, so a reopened project finds it. The
 * zip format itself is tested in Rust (`src-tauri/src/bundle/tests`).
 */
export function installProjectMockScript(): void {
  type Args = Record<string, unknown> & Uint8Array
  type Command = (args: Args, headers: Record<string, string>) => unknown
  type Pending = { name: string | null; scene: Uint8Array; recovered: boolean }
  const w = window as unknown as Record<string, unknown>
  const mock = w.__E2E_MOCK__ as {
    commands: Record<string, Command>
    emit: (event: string, payload: unknown) => void
    fail: (kind: string, message: string) => Promise<never>
    assets: Map<string, Uint8Array>
  }
  const disk = new Map<string, { scene: Uint8Array; thumbnail: number }>()
  const targets = new Map<string, string>()
  const recent: string[] = []
  const recovery = new Map<string, { title: string; scene: Uint8Array }>()
  let current: string | null = null
  let pending: Pending | null = null
  let dirty = false
  let closed = false
  let autosave: Uint8Array | null = null
  let nextOpen: string | null = null
  let nextSaveAs: string | null | undefined
  let launch: string | null = null
  let counter = 0

  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  const info = () => ({ fileName: current })
  const park = (next: Pending) => {
    pending = next
    const files = [...mock.assets.keys()].map((id) => `geometry/${id}.glb`)
    return { fileName: next.name, files, recovered: next.recovered }
  }
  const load = (name: string) => {
    const file = disk.get(name)
    if (!file) return mock.fail("io", `${name} could not be opened. No such file.`)
    return park({ name, scene: file.scene, recovered: false })
  }
  const close = () => {
    if (dirty) mock.emit("close-requested", null)
    else closed = true
    return null
  }

  const commands: Record<string, Command> = {
    project_info: info,
    project_new: () => {
      current = null
      return info()
    },
    project_open: () => {
      const name = nextOpen
      nextOpen = null
      return name === null ? null : load(name)
    },
    project_open_recent: (args) => load(String(args.id)),
    project_open_launch: () => {
      const name = launch
      launch = null
      return name === null ? null : load(name)
    },
    project_pending_scene: () =>
      pending
        ? pending.scene.slice().buffer
        : mock.fail("invalidInput", "Nothing is being opened."),
    project_commit: () => {
      if (!pending) return mock.fail("invalidInput", "Nothing is being opened.")
      current = pending.name
      if (current) recent.unshift(...[current].filter((n) => !recent.includes(n)))
      pending = null
      return info()
    },
    project_discard: () => {
      pending = null
      return null
    },
    project_pick_save_path: (args) => {
      const name = nextSaveAs === undefined ? `${String(args.suggestedName)}.stvd` : nextSaveAs
      nextSaveAs = undefined
      if (name === null) return null
      const token = `s${++counter}`
      targets.set(token, name)
      return { token, name, size: 0 }
    },
    project_save: (args, headers) => {
      const body = new Uint8Array(args)
      const length = Number(headers["x-scene-length"])
      const token = headers["x-target-token"]
      const name = token ? targets.get(token) : current
      if (!name) return mock.fail("invalidInput", "The project has no file yet: use Save As.")
      disk.set(name, { scene: body.slice(0, length), thumbnail: body.byteLength - length })
      current = name
      autosave = null
      return info()
    },
    project_set_dirty: (args) => {
      dirty = args.dirty === true
      return null
    },
    project_close_ack: () => null,
    project_close_confirmed: () => {
      closed = true
      return null
    },
    "plugin:window|close": close,
    recent_projects: () =>
      recent.map((name) => ({ id: name, name, folder: "/e2e", missing: !disk.has(name) })),
    autosave_write: (args) => {
      autosave = new Uint8Array(args).slice()
      return null
    },
    autosave_clear: () => {
      autosave = null
      return null
    },
    recovery_list: () =>
      [...recovery].map(([token, r]) => ({
        token,
        title: r.title,
        fileName: null,
        autosavedAtMs: 0,
        sizeBytes: r.scene.byteLength,
      })),
    recovery_restore: (args) => {
      const entry = recovery.get(String(args.token))
      if (!entry) return mock.fail("invalidInput", "Unknown recovery entry.")
      recovery.delete(String(args.token))
      return park({ name: null, scene: entry.scene, recovered: true })
    },
    recovery_discard: (args) => {
      recovery.delete(String(args.token))
      return null
    },
  }
  Object.assign(mock.commands, commands)

  // State that must exist before the app starts (crash recovery, a launch file): a test
  // stores it in sessionStorage and reloads, since a reload re-runs these scripts.
  const seed = JSON.parse(sessionStorage.getItem("e2e-seed") ?? "{}") as {
    disk?: Record<string, string>
    recovery?: { token: string; title: string; scene: string }[]
    launch?: string
  }
  for (const [name, scene] of Object.entries(seed.disk ?? {}))
    disk.set(name, { scene: new TextEncoder().encode(scene), thumbnail: 0 })
  for (const r of seed.recovery ?? [])
    recovery.set(r.token, { title: r.title, scene: new TextEncoder().encode(r.scene) })
  launch = seed.launch ?? null

  Object.assign(w.__E2E__ as object, {
    nextOpen: (name: string) => (nextOpen = name),
    nextSaveAs: (name: string | null) => (nextSaveAs = name),
    savedProjects: () => [...disk.keys()],
    savedScene: (name: string) => {
      const file = disk.get(name)
      return file ? text(file.scene) : null
    },
    thumbnailBytes: (name: string) => disk.get(name)?.thumbnail ?? 0,
    autosave: () => (autosave ? text(autosave) : null),
    windowClosed: () => closed,
    windowDirty: () => dirty,
    /** The window's close button. */
    requestClose: close,
    /** A second launch with a .stvd (single-instance forwarding). */
    launchWith: (name: string) => {
      launch = name
      mock.emit("open-requested", null)
    },
  })
}

/** Project helpers on `window.__E2E__` (see `E2EBackend` for the rest). */
export interface E2EProjectBackend {
  nextOpen(name: string): void
  nextSaveAs(name: string | null): void
  savedProjects(): string[]
  savedScene(name: string): string | null
  thumbnailBytes(name: string): number
  autosave(): string | null
  windowClosed(): boolean
  windowDirty(): boolean
  requestClose(): void
  launchWith(name: string): void
}
