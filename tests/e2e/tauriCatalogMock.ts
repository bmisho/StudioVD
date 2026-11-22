/**
 * The online catalog and Settings › Network for the E2E Tauri mock (PLAN 14.9), installed
 * after `installTauriMockScript`, into its command table. Self-contained, like that script.
 * Tests publish an index (and what each pack holds) with `__E2E_CATALOG__.publish`; Refresh
 * then "downloads" it, Download streams progress through the real Channel callback and stages
 * the pack for the shared Install commit, as Official. Signatures are Rust's (cargo tests).
 */
export function installCatalogMockScript(): void {
  type Args = Record<string, unknown>
  type Command = (args: Args, headers: Record<string, string>) => unknown
  type Manifest = { id: string; version: string; manifest: string }
  const w = window as unknown as Record<string, unknown>
  const mock = w.__E2E_MOCK__ as {
    commands: Record<string, Command>
    fail: (kind: string, message: string) => Promise<never>
    library: Record<string, unknown>[]
  }
  const { commands, fail, library } = mock
  const settings = {
    offline: false,
    consented: false,
    proxy: { mode: "system" } as Record<string, unknown>,
    mirror: null as string | null,
    weeklyCheck: false,
    lastCheck: null as number | null,
    extraCa: null as string | null,
  }
  let published: string | null = null
  let packs: Record<string, Manifest[]> = {}
  let cached: string | null = null
  let staged: { token: string; components: Manifest[] } | null = null
  let counter = 0
  const hosts = ["catalog.example"]

  w.__E2E_CATALOG__ = {
    publish: (index: string, holds: Record<string, Manifest[]>) => {
      published = index
      packs = holds
    },
  }
  const status = () => ({
    configured: true,
    hosts,
    offline: settings.offline,
    consented: settings.consented,
    index: cached,
    fetchedAt: cached ? Math.floor(Date.now() / 1000) : null,
    expired: false,
  })
  const view = () => ({
    settings: { ...settings },
    hosts,
    systemProxy: "the proxy environment variables",
    proxyInUse: settings.proxy.mode === "none" ? "none (direct connections)" : "the system's",
  })
  const online = () =>
    settings.offline
      ? fail("network", "Offline mode is on (Settings › Network).")
      : !settings.consented
        ? fail("invalidInput", "Allow StudioVD to use the network first.")
        : null

  commands.catalog_status = () => status()
  commands.catalog_refresh = () => {
    const refused = online()
    if (refused) return refused
    if (!published) return fail("network", "catalog.example does not have the file (404).")
    const changed = cached !== published
    cached = published
    return { status: status(), changed, previewsFailed: 0 }
  }
  commands.catalog_download = async (args) => {
    const refused = online()
    if (refused) return refused
    const holds = packs[String(args.pack)]
    if (!holds) return fail("invalidInput", "The catalog does not list that pack.")
    const channel = args.onProgress as { id: number }
    const total = 90_000
    for (let i = 0; i < 3; i++) {
      const callback = w[`_${channel.id}`] as ((m: unknown) => void) | undefined
      callback?.({ message: { done: (i + 1) * 30_000, total }, index: i })
      await new Promise((r) => setTimeout(r, 200))
    }
    staged = { token: `c${++counter}`, components: holds }
    return {
      token: staged.token,
      components: holds.map((m) => ({ ...m, manifestSha256: "0".repeat(64) })),
      files: holds.length,
      bytes: total,
      verified: true,
    }
  }
  const commit = commands.library_install_commit
  commands.library_install_commit = (args, headers) => {
    if (!staged || staged.token !== args.token) return commit?.(args, headers)
    for (const c of staged.components)
      library.push({ ...c, manifestSha256: "0".repeat(64), origin: "official", verified: true })
    staged = null
    return [...library]
  }
  commands.catalog_cancel = () => true
  commands.library_disk_usage = () => ({ store: 2_000_000, catalogs: 120_000, downloads: 0 })
  commands.network_settings = () => view()
  commands.network_save = (args) => {
    const next = args.settings as typeof settings
    Object.assign(settings, next, { lastCheck: settings.lastCheck, extraCa: settings.extraCa })
    return view()
  }
  commands.network_pick_ca = () => null
  commands.network_clear_ca = () => view()
  commands.network_test = () =>
    online() ?? [
      {
        host: "catalog.example",
        ok: true,
        message: "catalog.example answered; the catalog can be downloaded.",
      },
    ]
}
