// `zod` resolves to this module everywhere (vite.config.ts `resolve.alias`; tsc still reads
// zod's own types). No eval in the app (CLAUDE.md §3; the release CSP refuses it, PLAN 15.1):
// zod 4 probes `Function("")` while building object schemas and, when allowed, compiles
// parsers with `new Function`. Configuring zod here, in the module every importer of "zod"
// depends on, runs before any schema is built, whatever chunks the bundler makes and in every
// worker (each has its own zod).
import { config } from "zod/v4"

config({ jitless: true })

export * from "zod/v4"
export { z } from "zod/v4"
