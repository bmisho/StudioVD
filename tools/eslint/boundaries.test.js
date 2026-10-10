// @vitest-environment node
import path from "node:path"
import { RuleTester } from "eslint"
import tseslint from "typescript-eslint"
import { afterAll, describe, it } from "vitest"
import { studiovdPlugin } from "./boundaries.js"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.afterAll = afterAll

const ROOT = path.resolve(import.meta.dirname, "../..")
const at = (file) => path.join(ROOT, file)
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: "module" } })
const denied = [{ messageId: "denied" }]

tester.run("studiovd/boundaries", studiovdPlugin.rules.boundaries, {
  valid: [
    { filename: at("src/core/math/frame.ts"), code: 'import { Matrix4 } from "three"' },
    { filename: at("src/core/scene/tree.ts"), code: 'import { z } from "zod"' },
    { filename: at("src/core/scene/tree.ts"), code: 'import { x } from "../schema/ids"' },
    { filename: at("src/core/scene/tree.ts"), code: 'export { x } from "@/core/schema"' },
    { filename: at("src/features/a/b.tsx"), code: 'import { useState } from "react"' },
    {
      filename: at("src/lib/tauri/invoke.ts"),
      code: 'import { invoke } from "@tauri-apps/api/core"',
    },
    // Packages that merely start with a denied name are different packages.
    { filename: at("src/core/x.ts"), code: 'import "react-resizable-panels-like"' },
    { filename: at("src/core/sim/mna.ts"), code: 'import { lu } from "./linear"' },
  ],
  invalid: [
    { filename: at("src/core/x.ts"), code: 'import { useState } from "react"', errors: denied },
    {
      filename: at("src/core/x.ts"),
      code: 'import { jsx } from "react/jsx-runtime"',
      errors: denied,
    },
    {
      filename: at("src/core/x.ts"),
      code: 'import { Canvas } from "@react-three/fiber"',
      errors: denied,
    },
    // Relative and normalised paths into forbidden layers.
    {
      filename: at("src/core/x.ts"),
      code: 'import { s } from "../store/document/x"',
      errors: denied,
    },
    { filename: at("src/core/a/x.ts"), code: 'import { s } from "../../app/App"', errors: denied },
    {
      filename: at("src/core/x.ts"),
      code: 'import { s } from "@/core/../store/x"',
      errors: denied,
    },
    {
      filename: at("src/core/x.ts"),
      code: 'export * from "@/features/viewport/x"',
      errors: denied,
    },
    { filename: at("src/core/x.ts"), code: 'export { a } from "@/lib/utils"', errors: denied },
    // Dynamic import and require.
    { filename: at("src/core/x.ts"), code: 'await import("@tauri-apps/api/core")', errors: denied },
    { filename: at("src/core/x.ts"), code: "await import(`react`)", errors: denied },
    { filename: at("src/core/x.ts"), code: 'const m = require("react")', errors: denied },
    {
      filename: at("src/core/x.ts"),
      code: "await import(name)",
      errors: [{ messageId: "computed" }],
    },
    // Tauri outside the wrapper, from any layer.
    {
      filename: at("src/app/App.tsx"),
      code: 'import { invoke } from "@tauri-apps/api/core"',
      errors: denied,
    },
    {
      filename: at("src/features/a.tsx"),
      code: 'import "@tauri-apps/plugin-dialog"',
      errors: denied,
    },
    // three.js is allowed in core, but not in the solver.
    {
      filename: at("src/core/sim/mna.ts"),
      code: 'import { Vector3 } from "three"',
      errors: denied,
    },
  ],
})

// Type-position imports need the TypeScript parser.
new RuleTester({ languageOptions: { parser: tseslint.parser } }).run(
  "studiovd/boundaries (TypeScript)",
  studiovdPlugin.rules.boundaries,
  {
    valid: [{ filename: at("src/core/x.ts"), code: 'type V = import("three").Vector3' }],
    invalid: [
      { filename: at("src/core/x.ts"), code: 'type C = typeof import("react")', errors: denied },
      { filename: at("src/core/x.ts"), code: 'import type { FC } from "react"', errors: denied },
    ],
  }
)
