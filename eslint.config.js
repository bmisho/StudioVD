// ESLint flat config. Several CLAUDE.md rules are enforced here mechanically:
// §3 file size, named exports, no `any`/eval, Tauri only via src/lib/tauri, and src/core
// purity (no React/R3F/DOM/Tauri/app layers; src/core/sim also no three.js). These checks
// catch mistakes; they are not a sandbox, and review still applies.
import js from "@eslint/js"
import prettier from "eslint-config-prettier"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import { studiovdPlugin } from "./tools/eslint/boundaries.js"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

// drei exports that are known not to fetch from the network (CLAUDE.md §6). Environment,
// Stage, Text, useGLTF/Gltf (DRACO), Ktx2, DetectGPU, Cloud and Matcap/Normal textures load
// from CDNs. Read the module source before adding a name.
const DREI_OFFLINE_ALLOWLIST = {
  paths: [
    {
      name: "@react-three/drei",
      // TransformControls: three-stdlib's gizmo wrapped in React, no loaders (checked 10.7.9).
      allowImportNames: [
        "CameraControlsImpl",
        "GizmoHelper",
        "GizmoViewcube",
        "GizmoViewport",
        "TransformControls",
      ],
      message: "drei export not on the offline allowlist (CLAUDE.md §6). See eslint.config.js.",
    },
  ],
  patterns: [
    { group: ["@react-three/drei/*"], message: "Import drei only through its allowlisted barrel." },
  ],
}
// Layer boundaries are checked on resolved import targets by a local rule (see its tests).
const DEFAULT_EXPORTS = [
  { selector: "ExportDefaultDeclaration", message: "Use named exports (CLAUDE.md §3)." },
  {
    selector: "ExportSpecifier[exported.name='default']",
    message: "Use named exports (CLAUDE.md §3).",
  },
]
const TAURI_GLOBALS = ["__TAURI__", "__TAURI_INTERNALS__"].map((name) => ({
  name,
  message: "Use the typed wrappers in src/lib/tauri (CLAUDE.md §3).",
}))
const TAURI_PROPERTIES = ["window", "globalThis"].flatMap((object) =>
  TAURI_GLOBALS.map(({ name, message }) => ({ object, property: name, message }))
)
// src/core runs in workers and Node tests: no DOM or browser globals (CLAUDE.md §3).
const DOM_GLOBALS = [
  "window",
  "document",
  "navigator",
  "location",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "requestAnimationFrame",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
].map((name) => ({ name, message: "src/core must not use DOM/browser APIs (CLAUDE.md §3)." }))
const DOM_PROPERTIES = ["document", "window", "navigator", "location"].map((property) => ({
  object: "globalThis",
  property,
  message: "src/core must not use DOM/browser APIs (CLAUDE.md §3).",
}))

export default defineConfig([
  globalIgnores([
    "dist",
    "coverage",
    "src-tauri",
    "docs",
    "playwright-report",
    "test-results",
    "node_modules",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh, studiovd: studiovdPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "studiovd/boundaries": "error",
      "no-restricted-imports": ["error", DREI_OFFLINE_ALLOWLIST],
      "no-restricted-globals": ["error", ...TAURI_GLOBALS],
      "no-restricted-properties": ["error", ...TAURI_PROPERTIES],
      "no-restricted-syntax": ["error", ...DEFAULT_EXPORTS],
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["src/lib/tauri/**/*.{ts,tsx}"],
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },
  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", ...TAURI_GLOBALS, ...DOM_GLOBALS],
      "no-restricted-properties": ["error", ...TAURI_PROPERTIES, ...DOM_PROPERTIES],
      "no-restricted-syntax": [
        "error",
        ...DEFAULT_EXPORTS,
        { selector: "JSXElement, JSXFragment", message: "src/core must not contain JSX." },
      ],
    },
  },
  {
    // R3F scene code mutates three.js objects (scene, cameras, controls, materials) from
    // effects and useFrame by design; they are not React state, and the React Compiler is not
    // used. The rule stays on everywhere else.
    files: ["src/features/viewport/**/*.{ts,tsx}", "src/features/physics/**/*.{ts,tsx}"],
    rules: { "react-hooks/immutability": "off" },
  },
  {
    // Generated shadcn/ui primitives (CLAUDE.md §3 exempts them from the size limit).
    files: ["src/components/ui/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off", "max-lines": "off" },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}", "tests/e2e/**/*.ts"],
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Tool config files need default exports and run in Node.
    files: ["*.config.ts", "tests/e2e/**/*.ts"],
    languageOptions: { globals: globals.node },
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Playwright fixtures call `use()`, which is not a React hook.
    files: ["tests/e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  prettier,
])
