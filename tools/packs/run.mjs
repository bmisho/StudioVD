// Runs a pack-builder entry (TypeScript, importing the app's `src/core` through the app's
// own Vite aliases: `@/…` and the eval-free zod) in Node, through Vite's module runner.
//
//   node tools/packs/run.mjs <entry.ts> [args…]
import { fileURLToPath } from "node:url"
import { createServer, createServerModuleRunner } from "vite"

const root = fileURLToPath(new URL("../..", import.meta.url))
const [entry, ...args] = process.argv.slice(2)
if (!entry) throw new Error("usage: node tools/packs/run.mjs <entry.ts> [args…]")

const server = await createServer({
  root,
  configFile: `${root}/vite.config.ts`,
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  logLevel: "warn",
  optimizeDeps: { noDiscovery: true, include: [] },
})
const runner = createServerModuleRunner(server.environments.ssr, { hmr: false })
let code = 0
try {
  const mod = await runner.import(entry)
  if (typeof mod.main !== "function") throw new Error(`${entry} exports no main()`)
  code = (await mod.main(args)) ?? 0
} catch (e) {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e)
  code = 1
} finally {
  await runner.close()
  await server.close()
}
process.exit(code)
