// ESLint flat config. Several CLAUDE.md rules are enforced here mechanically:
// §3 file size, named exports, no `any`/eval, Tauri imports only via src/lib/tauri,
// and src/core purity (no React/R3F/Tauri/app layers; src/core/sim also no three.js).
import js from "@eslint/js"
import prettier from "eslint-config-prettier"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

const TAURI = {
  group: ["@tauri-apps/*"],
  message: "Import Tauri APIs only through src/lib/tauri (CLAUDE.md §3).",
}
const CORE_PURITY = {
  group: ["react", "react-dom", "react-dom/*", "@react-three/*", "@/app/*", "@/features/*"],
  message: "src/core is pure TypeScript: no React, R3F or app layers (CLAUDE.md §3).",
}
const CORE_LAYERS = {
  group: ["@/store/*", "@/components/*", "@/lib/*"],
  message: "src/core must not depend on the store, UI or Tauri wrappers (CLAUDE.md §3).",
}
const NO_THREE = {
  group: ["three", "three/*"],
  message: "src/core/sim must not import three.js (CLAUDE.md §3).",
}

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
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-imports": ["error", { patterns: [TAURI] }],
      "no-restricted-syntax": [
        "error",
        { selector: "ExportDefaultDeclaration", message: "Use named exports (CLAUDE.md §3)." },
      ],
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["src/lib/tauri/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [TAURI, CORE_PURITY, CORE_LAYERS] }],
    },
  },
  {
    files: ["src/core/sim/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [TAURI, CORE_PURITY, CORE_LAYERS, NO_THREE] }],
    },
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
      "no-restricted-imports": "off",
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
