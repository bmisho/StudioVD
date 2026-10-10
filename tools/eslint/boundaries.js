// Local ESLint plugin: layer boundaries from CLAUDE.md §3, checked on the RESOLVED import
// target. Unlike no-restricted-imports patterns, relative paths ("../store/x"), "@/core/../x",
// dynamic import(), re-exports and require() cannot slip past it.
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "../..")

/** Matchers: an exact package, a scope ("@tauri-apps/"), or a repo directory. */
const pkg = (name) => (t) =>
  t.kind === "package" && (name.endsWith("/") ? t.name.startsWith(name) : t.name === name)
const dir = (prefix) => (t) =>
  t.kind === "path" && (t.path === prefix || t.path.startsWith(`${prefix}/`))

const TAURI_MESSAGE = "Import Tauri APIs only through src/lib/tauri (CLAUDE.md §3)."
const CORE_MESSAGE =
  "src/core is pure TypeScript: no React, R3F, DOM, store, UI or Tauri layers (CLAUDE.md §3)."

/** Each layer: files under `from` (minus `except`) may not import targets matching `deny`. */
export const LAYERS = [
  { from: "src", except: ["src/lib/tauri"], deny: [pkg("@tauri-apps/")], message: TAURI_MESSAGE },
  {
    from: "src/core",
    deny: [
      pkg("react"),
      pkg("react-dom"),
      pkg("@react-three/"),
      pkg("@xyflow/"),
      pkg("@tauri-apps/"),
      dir("src/app"),
      dir("src/features"),
      dir("src/store"),
      dir("src/components"),
      dir("src/lib"),
      dir("src/workers"),
    ],
    message: CORE_MESSAGE,
  },
  { from: "src/core/sim", deny: [pkg("three")], message: "src/core/sim must not import three.js." },
]

const toPosix = (p) => p.split(path.sep).join("/")

/** Resolves an import specifier to a package name or a repo-relative path. */
export function resolveTarget(specifier, fromFile) {
  if (specifier.startsWith("@/")) {
    return { kind: "path", path: path.posix.normalize(`src/${specifier.slice(2)}`) }
  }
  if (specifier.startsWith(".")) {
    const abs = path.resolve(path.dirname(fromFile), specifier)
    return { kind: "path", path: toPosix(path.relative(ROOT, abs)) }
  }
  const parts = specifier.split("/")
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier)
  return { kind: "package", name }
}

const inside = (file, prefix) => file === prefix || file.startsWith(`${prefix}/`)

function layersFor(file) {
  return LAYERS.filter(
    (l) => inside(file, l.from) && !(l.except ?? []).some((e) => inside(file, e))
  )
}

/** The literal specifier of an import-like node, or null if it is computed. */
function specifierOf(source) {
  if (!source) return undefined
  if (source.type === "Literal" && typeof source.value === "string") return source.value
  if (source.type === "TemplateLiteral" && source.expressions.length === 0) {
    return source.quasis[0]?.value.cooked ?? null
  }
  return null
}

const boundaries = {
  meta: {
    type: "problem",
    docs: { description: "Enforce StudioVD layer boundaries on resolved import targets" },
    schema: [],
    messages: {
      denied: "{{message}} ('{{specifier}}')",
      computed: "Computed import specifiers are not allowed here; boundaries must be checkable.",
    },
  },
  create(context) {
    const file = toPosix(path.relative(ROOT, context.filename))
    const layers = layersFor(file)
    if (layers.length === 0) return {}

    const check = (node, source) => {
      const specifier = specifierOf(source)
      if (specifier === undefined) return
      if (specifier === null) {
        context.report({ node, messageId: "computed" })
        return
      }
      const target = resolveTarget(specifier, context.filename)
      const layer = layers.find((l) => l.deny.some((matches) => matches(target)))
      if (layer)
        context.report({ node, messageId: "denied", data: { message: layer.message, specifier } })
    }

    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
      TSImportType: (node) =>
        check(node, node.argument.type === "TSLiteralType" ? node.argument.literal : node.argument),
      CallExpression: (node) => {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          check(node, node.arguments[0])
        }
      },
    }
  },
}

export const studiovdPlugin = { rules: { boundaries } }
