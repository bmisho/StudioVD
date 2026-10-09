# CLAUDE.md: StudioVD project rules

StudioVD is a desktop 3D CAD assembly visualizer and interactive assembly simulator:
import parts, apply PBR materials, place anchors, mate parts with mechanical constraints,
drag movable parts to test kinematics (with collisions), and map physical/electrical
behaviour in an active, multi-domain node schematic.

`PLAN.md` is the source of truth for scope and order of work. **Work phase by phase.
Never start the next phase without explicit user approval.** Tick checklist items in
`PLAN.md` as they are completed and verified.

---

## 1. Tech stack (pinned, do not swap without approval)

| Layer | Choice | Notes |
|---|---|---|
| Desktop shell | Tauri 2 (Rust) | File I/O, zip bundles, workspace dirs, heavy geometry (convex decomposition) |
| UI framework | React 19 + TypeScript 6 (strict) | `@react-three/fiber` 9 currently requires React `>=19 <19.4` |
| Build | Vite 8 | Dev server on fixed port 1420 (Tauri expects it) |
| 3D | three.js + `@react-three/fiber` 9 + `@react-three/drei` 10 | WebGL2 only (no WebGPU: not reliable in all Tauri webviews) |
| Picking | `three-mesh-bvh` | All raycasts against imported meshes go through a BVH |
| Physics | `@react-three/rapier` 2 | Uses the `@dimforge/rapier3d-compat` version it pins. **Never install a second rapier3d package** (two WASM instances = broken handles) |
| CAD import | GLTF/GLB, OBJ, STL via three loaders; STEP/IGES via `occt-import-js` (WASM, LGPL-2.1) | STEP/IGES parse only inside a Web Worker, WASM lazy-loaded |
| Schematic | `@xyflow/react` (React Flow 12) | Nodes/edges live in Zustand (controlled flow) |
| UI kit | Tailwind CSS 4 (`@tailwindcss/vite`) + shadcn/ui | shadcn files in `src/components/ui/` are generated, edit sparingly |
| State | Zustand 5 + `immer` + `zundo` (undo/redo) | See §4 |
| Validation | `zod` | All `scene.json` I/O is schema-validated |
| Tests | Vitest (+ React Testing Library, jsdom), Playwright (E2E, mocked Tauri IPC), `cargo test` | See §8 |

Adding any new runtime dependency requires a one-line justification in the commit message.
Prefer small, tree-shakeable libraries. No CDN or network fetches at runtime (see §6).

## 2. Repository layout

```
src/
  app/            Shell: layout, menu bar, toolbar, status bar, shortcuts
  components/ui/  shadcn/ui generated primitives
  features/       One folder per feature, each owning its components + hooks
    viewport/     R3F canvas, camera, controls, grid, lighting, picking
    physics/      Rapier world, bodies, joints, drag controller
    assembly/     Anchors, mates, snapping, assembly graph
    materials/    PBR library + editor
    import/       Loaders, import dialog, workers
    schematic/    React Flow editor, node types, ports
    scene-graph/  Left sidebar tree
    properties/   Right sidebar inspectors
  core/           PURE TypeScript. No React, no R3F, no DOM, no Tauri
    math/         Frames, transforms, fitting (three math types allowed)
    sim/          Netlist compiler, MNA solver, signal propagation (no three.js at all)
    schema/       zod schemas for scene.json + migrations
    units.ts      The only place unit conversions live
  store/          Zustand slices + selectors
  lib/tauri/      Typed wrappers for every Tauri command/plugin call
  workers/        Web Worker entry points
src-tauri/src/
  commands/       #[tauri::command] handlers (thin; delegate to modules)
  bundle/         Project bundle zip read/write
  workspace/      Per-project working directory management
  geometry/       Convex decomposition (parry3d) and other heavy geometry
tests/e2e/        Playwright specs
```

## 3. Code rules

- **File size: max ~200 lines per file** (components, hooks, and modules alike). Over that,
  split it. Generated shadcn files are exempt.
- One React component per file. Named exports only (no default exports, except where a
  tool requires one).
- Components render; they do not own business logic. Logic goes in `core/` (pure, unit
  tested) or in store actions.
- `src/core/**` must not import React, R3F, drei, DOM APIs, or `@tauri-apps/*`.
  `src/core/sim/**` must not import three.js either.
- **Never import `@tauri-apps/api` or plugins outside `src/lib/tauri/`.** This keeps the
  UI runnable in a plain browser for E2E tests with mocked IPC.
- No `any` (use `unknown` + narrowing). No non-null assertions without a comment saying why.
- No `eval`, `new Function`, or string-to-code. User-defined block behaviour uses a sandboxed
  expression parser.
- IDs are opaque strings (`crypto.randomUUID()`), typed with branded types (`PartId`, `AnchorId`, ...).
- Rust: no `unwrap()`/`expect()` in command paths. Return `Result<T, AppError>` where
  `AppError` serializes to a typed error for the frontend.

## 4. State management rules

Three kinds of state. Do not mix them.

1. **Document state** (persisted to `scene.json`, undoable via `zundo`): assets, parts,
   design-pose transforms, materials, anchors, mates, schematic nodes/edges, bindings,
   simulation settings. Normalized: `Record<Id, Entity>`.
2. **Session state** (Zustand, not persisted, not undoable): selection, active tool, camera
   projection, panel layout, test-mode flag, simulation *results*.
3. **Transient per-frame state** (plain mutable objects or refs, **never Zustand**): live
   physics poses, drag targets, hover candidates. Read in `useFrame`, sampled when needed.

Further rules:
- Subscribe with narrow selectors (`useStore(s => s.parts[id])`, `useShallow` for objects).
- Continuous gestures (gizmo drags, node drags, slider scrubs) must produce **one** undo
  entry: pause history tracking on start, resume on end.
- Never put geometry buffers, textures, or three.js objects in the store. Store asset IDs.
- Simulation results live in the session store keyed by node/port ID, not inside React Flow
  node `data` (that would re-render the whole graph on every solve).

## 5. Units, coordinates, transforms

- **Geometry/scene unit: millimetre.** Imports are converted at import time (GLTF metres x1000;
  STL/OBJ unit chosen in the import dialog, default mm; STEP via occt `linearUnit: millimeter`).
- **Simulation unit: SI** (m, kg, s, N, V, A, Pa, ...). Convert only through `src/core/units.ts`.
- World is **right-handed, Y-up** (three.js default). Z-up sources are rotated at import.
- Part transforms are **rigid only** (position + quaternion). Scale is baked into geometry at
  import, never applied to parts (it breaks colliders and anchor frames).
- Rapier world gravity is **zero**. Gravity exists only in the simulation solver.

## 6. Rendering & performance rules

- Target: up to **200 parts**, ~2-3 M triangles total, 60 fps orbit on an integrated GPU.
  No LOD/instancing work unless profiling proves it is needed.
- Canvas uses `frameloop="demand"` in design mode (call `invalidate()` after changes);
  `"always"` only while test mode is running.
- Heavy CPU work runs off the main thread: STEP/IGES parsing (worker), simulation solve
  (worker), convex decomposition (Rust).
- **Offline-first: no runtime network requests.** Do not use drei `Environment` presets
  (they fetch HDRIs from a CDN) or default DRACO/meshopt decoder URLs (gstatic). Bundle
  decoders, fonts, and environment maps locally.
- Large binaries never cross IPC as JSON. Assets live in the project workspace dir and are
  loaded via the Tauri asset protocol; writes use raw binary IPC payloads.

## 7. Design system: light theme, white + light blue

Contrast ratios were computed against WCAG 2.x (text needs >=4.5:1, UI graphics >=3:1).
Light blue is used for **surfaces and highlights**; deeper sky blues carry text/fills
because light blue on white fails contrast (sky-400 #38BDF8 is only 2.14:1).

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `background` | `#FFFFFF` | App and panel background | n/a |
| `surface` | `#F8FAFC` (slate-50) | Sidebars, menu bar, toolbars | n/a |
| `border` | `#E2E8F0` (slate-200) | Dividers, panel edges (decorative) | 1.23:1 |
| `input` | `#CBD5E1` (slate-300) | Input outlines | 1.48:1 (paired with focus ring) |
| `foreground` | `#0F172A` (slate-900) | Primary text | 17.85:1 on white |
| `muted-foreground` | `#64748B` (slate-500) | Labels, secondary text | 4.76:1 white, 4.55:1 slate-50 |
| `primary` | `#0369A1` (sky-700) | Primary buttons (white text), links, active icons | 5.93:1 |
| `primary-hover` | `#075985` (sky-800) | Hover/pressed primary | white text 7.56:1 |
| `accent` | `#E0F2FE` (sky-100) | Selected rows, active tool/tab background | sky-800 text on it 6.59:1 |
| `accent-subtle` | `#F0F9FF` (sky-50) | Hover rows | sky-800 text on it 7.09:1 |
| `ring` | `#0284C7` (sky-600) | Focus rings | 4.10:1 (>=3:1 UI) |
| `highlight-3d` | `#0EA5E9` (sky-500) | 3D selection outline, anchor glyphs | 3D only, not text |
| `destructive` | `#DC2626` (red-600) | Errors, delete | 4.83:1 |
| `warning` | `#B45309` (amber-700) | Warnings | 5.02:1 |
| `success` | `#15803D` (green-700) | OK states | 5.02:1 |
| viewport bg | `#F8FAFC` -> `#E2E8F0` vertical gradient | 3D viewport only | n/a |

**Schematic domain colours** (wires, port glyphs; each >=3:1 on white). Colour is never the
only cue: each domain also has a distinct line pattern and port shape.

| Domain | Hex | Line |
|---|---|---|
| Electrical (V, I) | `#EA580C` (orange-600) 3.56:1 | solid |
| Mechanical (F/v, tau/omega) | `#475569` (slate-600) 7.58:1 | thick solid |
| Fluid / pressure (P, Q) | `#0D9488` (teal-600) 3.74:1 | long dash |
| Light (flux) | `#A16207` (yellow-700) 4.92:1 | dotted |
| Data / signal | `#7C3AED` (violet-600) 5.70:1 | short dash |

UI density: this is a desktop tool. Use compact sizes (`text-xs`/`text-sm`, 28-32 px
controls), `tabular-nums` for numeric readouts, Inter (bundled locally) for UI text.
No hard-coded hex values in components; use Tailwind theme tokens.

## 8. Commands & verification

Current:
- `npm run dev`: Vite dev server only (browser, no Tauri APIs)
- `npm run tauri dev`: full desktop app
- `npm run build`: typecheck + production frontend build
- `cd src-tauri && cargo check` / `cargo test`

Added in Phase 2 (keep this list updated): `npm run lint`, `npm run typecheck`, `npm test`
(Vitest), `npm run test:e2e` (Playwright, browser with mocked Tauri IPC), `cargo clippy`.

Before every commit: lint, typecheck, unit tests, and `cargo check` must pass. Before closing
a phase: also E2E and a full `npm run build`. Physics and solver behaviour is tested
headlessly (Rapier and the solver run in Node), not by eyeballing the viewport.

Linux dev needs: `libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.

## 9. Security

- Tauri capabilities are least-privilege; fs access scoped to the project workspace, app
  data/cache dirs, and paths the user picked in a dialog.
- Zip extraction rejects absolute paths and `..` segments (zip-slip) and enforces size limits.
- A strict CSP replaces `"csp": null` before release (Phase 13).

## 10. Git

- Small, focused commits with descriptive messages (`feat(viewport): ...`, `fix(physics): ...`).
- Phase work happens on the designated feature branch; no PRs unless asked.
