import { readdirSync } from "node:fs"
import path from "node:path"

/** Folders whose files are the app's source (generated and installed trees left out). */
export const ROOTS = ["src", "tests", "tools", "src-tauri/src", "src-tauri/capabilities"]

/**
 * The module name an import resolves to: the file name without its last extension
 * (`Foo.tsx` and `foo.ts` are both `foo` to `import "./Foo"` on a case-insensitive disk).
 */
const moduleName = (file) => file.replace(/\.[^.]*$/, "").toLowerCase()

/**
 * Groups of files that one case-insensitive file system (Windows: WebView2, the main target)
 * cannot tell apart: two entries of a folder whose names, or whose module names, differ only
 * by case. On Linux both exist and each import finds its own; on Windows an import of
 * `./AnchorPreview` resolved `anchorPreview.ts` (Vite tries .ts before .tsx) and the 3D view
 * failed with "does not provide an export named 'AnchorPreview'".
 */
export function caseCollisions(names) {
  const groups = new Map()
  for (const name of names) {
    for (const key of new Set([name.toLowerCase(), moduleName(name)])) {
      const group = groups.get(key) ?? new Set()
      group.add(name)
      groups.set(key, group)
    }
  }
  const found = new Map()
  for (const group of groups.values()) {
    if (group.size < 2) continue
    // Files of one module with different extensions (foo.ts, foo.test.ts) are fine as long
    // as their names agree in case.
    const spellings = new Set([...group].map((n) => n.replace(/\.[^.]*$/, "")))
    const names = new Set([...group].map((n) => n.toLowerCase()))
    if (spellings.size === 1 && names.size === group.size) continue
    const sorted = [...group].sort()
    found.set(sorted.join("\n"), sorted) // one pair can match by name and by module name
  }
  return [...found.values()]
}

/** Every collision under `root`, as paths relative to it. */
export function findCaseCollisions(root, roots = ROOTS) {
  const found = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const group of caseCollisions(entries.map((e) => e.name)))
      found.push(group.map((n) => path.relative(root, path.join(dir, n))))
    for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name))
  }
  for (const r of roots) walk(path.join(root, r))
  return found
}
