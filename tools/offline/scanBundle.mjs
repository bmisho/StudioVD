// Offline guard (CLAUDE.md §6): the webview never makes network requests. Fails when the
// production bundle contains a URL that is not a known-inert string. Fail-closed: every
// allowlist entry needs a reason, and a new URL needs review before it ships.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const URL_PATTERN = /(?:https?|wss?|ftp):\/\/[^\s"'`)<>\\]+/g
// "//cdn.example.com/x" in a string literal would be fetched relative to the page protocol.
const PROTOCOL_RELATIVE = /["'`](\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'`]*)/gi
const SCANNED = new Set([".js", ".mjs", ".css", ".html", ".json"])

/** Known-inert strings found in real builds. `exact` or `prefix`, always with `why`. */
export const ALLOWLIST = [
  { prefix: "http://www.w3.org/", why: "XML/SVG/MathML namespace identifiers" },
  { prefix: "https://react.dev/errors/", why: "React error-message links (text only)" },
  { prefix: "http://json-schema.org/", why: "zod JSON Schema $schema identifiers" },
  { prefix: "https://json-schema.org/", why: "zod JSON Schema $schema identifiers" },
  { exact: "https://bit.ly/3cXEKWf", why: "Immer error-message link" },
  { exact: "http://[${e}]", why: "zod IPv6 URL template, not a request" },
  { prefix: "https://docs.pmnd.rs/react-three-fiber/", why: "R3F error-message link" },
  { exact: "https://jcgt.org/published/0007/04/01/", why: "three.js shader source comment" },
  ...[
    "https://creativecommons.org/publicdomain/zero/1.0/",
    "https://creativecommons.org/licenses/by/4.0/",
  ].map((exact) => ({
    exact,
    why: "licenseUrl text written into a saved component's manifest (Save as component)",
  })),
  ...[
    "https://github.com/codyjasonbennett",
    "https://github.com/drcmda",
    "https://github.com/joshuaellis",
    "https://github.com/krispya",
    "https://github.com/pmndrs/react-three-fiber#readme",
    "https://github.com/pmndrs/react-three-fiber.git",
    "https://github.com/pmndrs/react-three-fiber/issues",
    "https://github.com/react-spring/react-use-measure/#resize-observer-polyfills",
    "https://opencollective.com/react-three-fiber",
  ].map((exact) => ({ exact, why: "package metadata or doc links embedded by R3F" })),
  { exact: "https://${e}flow.dev/error#001", why: "React Flow error-message link (text only)" },
  ...["https://reactflow.dev/", "https://reactflow.dev?utm_source=attribution"].map((exact) => ({
    exact,
    why: "React Flow attribution link: kept as the authors ask, clicks are prevented (Phase 11)",
  })),
]

export function isAllowed(url, allowlist = ALLOWLIST) {
  return allowlist.some((e) => (e.exact ? url === e.exact : url.startsWith(e.prefix)))
}

/** URLs in `text` that are not on the allowlist. */
export function findUrls(text, allowlist = ALLOWLIST) {
  const found = new Set()
  for (const m of text.matchAll(URL_PATTERN)) found.add(m[0])
  for (const m of text.matchAll(PROTOCOL_RELATIVE)) if (m[1]) found.add(m[1])
  return [...found].filter((url) => !isAllowed(url, allowlist))
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

export function scanDir(dir, allowlist = ALLOWLIST) {
  return walk(dir)
    .filter((file) => SCANNED.has(path.extname(file)))
    .flatMap((file) =>
      findUrls(readFileSync(file, "utf8"), allowlist).map((url) => ({ file, url }))
    )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? "dist"
  const findings = scanDir(dir)
  for (const { file, url } of findings) console.error(`${file}: ${url}`)
  if (findings.length > 0) {
    console.error(
      `\n${findings.length} unreviewed URL(s) in ${dir}. The webview must not use the network ` +
        "(CLAUDE.md §6). If a URL is inert text, add it to ALLOWLIST in tools/offline/scanBundle.mjs with a reason."
    )
    process.exit(1)
  }
  console.log(`Offline check passed: no unreviewed URLs in ${dir}.`)
}
