// Writes public/third-party-notices.txt (PLAN 15.8): every npm package and Rust crate that
// ships in StudioVD, with its licence and the licence texts, grouped where identical. The
// app shows it in Help › About; `npm run notices` regenerates it before a release.
//
// npm: the production closure from package-lock.json (entries not marked dev).
// Rust: the normal dependency graph of src-tauri (no dev or build dependencies), every target.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const root = new URL("../..", import.meta.url).pathname
const LICENCE_FILE = /^(licen[cs]e|copying|notice)([-._][a-z0-9.-]*)?$/i

/** Packages whose manifest names no licence: what they state elsewhere, with where. */
const DECLARED = {
  "webgl-constants": "MIT (stated in its README; LICENSE file included)",
  "@react-three/rapier":
    "UNKNOWN: the published package has no licence field or file; see " +
    "https://github.com/pmndrs/react-three-rapier",
}

function licenceTexts(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => LICENCE_FILE.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n").trim())
}

function npmPackages() {
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"))
  const out = []
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path || entry.dev || entry.devOptional || entry.link) continue
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length)
    const dir = join(root, path)
    let licence = entry.license
    if (!licence && existsSync(join(dir, "package.json")))
      licence = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).license
    licence ??= Object.hasOwn(DECLARED, name) ? DECLARED[name] : "UNKNOWN"
    out.push({ name, version: entry.version, licence, texts: licenceTexts(dir) })
  }
  return out
}

function crates() {
  const meta = JSON.parse(
    execFileSync("cargo", ["metadata", "--format-version", "1", "--locked"], {
      cwd: join(root, "src-tauri"),
      maxBuffer: 256 * 1024 * 1024,
    }).toString()
  )
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]))
  const byId = new Map(meta.packages.map((p) => [p.id, p]))
  const seen = new Set()
  const stack = [meta.resolve.root]
  while (stack.length > 0) {
    const id = stack.pop()
    if (seen.has(id)) continue
    seen.add(id)
    for (const dep of nodes.get(id)?.deps ?? [])
      if (dep.dep_kinds.some((k) => k.kind === null)) stack.push(dep.pkg)
  }
  seen.delete(meta.resolve.root)
  return [...seen].map((id) => {
    const p = byId.get(id)
    return {
      name: p.name,
      version: p.version,
      licence: p.license ?? (p.license_file ? `see ${p.license_file}` : "UNKNOWN"),
      texts: licenceTexts(dirname(p.manifest_path)),
    }
  })
}

const all = [
  ...npmPackages().map((p) => ({ ...p, kind: "npm" })),
  ...crates().map((p) => ({ ...p, kind: "crate" })),
]
all.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))

const groups = new Map()
for (const p of all) {
  const text = p.texts.join("\n\n----\n\n") || `(no licence file shipped; licence: ${p.licence})`
  const key = createHash("sha256").update(text).digest("hex")
  const g = groups.get(key) ?? { text, names: [] }
  g.names.push(`${p.name} ${p.version}`)
  groups.set(key, g)
}

const lines = [
  "StudioVD third-party notices",
  "",
  "StudioVD includes the following open-source software. Each is listed with its licence;",
  "the licence texts follow, each once with the packages it covers.",
  "",
  "STEP and IGES import use OpenCascade through occt-import-js (LGPL-2.1), shipped as separate,",
  "replaceable files; their licence texts are in licenses/ next to this file.",
  "Generated parts: the dimension tables are written for StudioVD from the standards and",
  "published data (CC0-1.0); each generator names its sources in the Library's",
  "Licence & source popover.",
  "",
  ...all.map(
    (p) => `${p.kind === "npm" ? "npm  " : "crate"}  ${p.name} ${p.version}  ${p.licence}`
  ),
  "",
]
for (const g of groups.values())
  lines.push("=".repeat(78), `Applies to: ${g.names.join(", ")}`, "", g.text, "")
writeFileSync(join(root, "public", "third-party-notices.txt"), lines.join("\n"))
console.log(`${all.length} packages, ${groups.size} licence texts`)
