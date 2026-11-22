import { readFileSync } from "node:fs"
import { fileURLToPath, URL } from "node:url"
import process from "node:process"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const host = process.env.TAURI_DEV_HOST

/** The release CSP from tauri.conf.json, as a header (the CSP E2E test serves the build with it). */
function releaseCsp(): string {
  const conf = JSON.parse(
    readFileSync(new URL("./src-tauri/tauri.conf.json", import.meta.url), "utf8")
  ) as { app: { security: { csp: Record<string, string> } } }
  return Object.entries(conf.app.security.csp)
    .map(([directive, sources]) => `${directive} ${sources}`)
    .join("; ")
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // zod without eval, configured before any schema is built (PLAN 15.1).
      {
        find: /^zod$/,
        replacement: fileURLToPath(new URL("./src/core/schema/zodNoEval.ts", import.meta.url)),
      },
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    // 3. tell Vite to ignore watching `src-tauri`
    watch: { ignored: ["**/src-tauri/**"] },
  },

  // `vite preview` of a production build; STUDIOVD_RELEASE_CSP=1 adds the app's CSP (PLAN 15.1).
  preview: {
    port: 4173,
    strictPort: true,
    headers: process.env.STUDIOVD_RELEASE_CSP ? { "Content-Security-Policy": releaseCsp() } : {},
  },

  // Module workers: the import worker code-splits (occt-import-js loads on demand).
  worker: { format: "es" },
  // The dev dependency scan starts from index.html and does not follow `new Worker(...)`, so
  // worker-only deps (occt-import-js, three's loaders) were found at runtime, re-optimized,
  // and every open page reloaded (it broke parallel E2E runs). Scan the workers up front.
  optimizeDeps: { entries: ["index.html", "src/workers/*.worker.ts"] },

  build: {
    // The 500 kB default targets websites. This bundle loads from local disk inside the
    // desktop app; heavy work (STEP import, solver) is split into workers instead.
    chunkSizeWarningLimit: 4000,
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tools/**/*.test.js"],
    css: false,
    restoreMocks: true,
  },
})
