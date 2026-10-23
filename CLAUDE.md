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
| Targets | **Windows** (WebView2 = Chromium) and **Linux** (WebKitGTK 4.1) | macOS is not a target; keep code portable but don't spend effort on it |
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
| Library downloads | Rust only: `reqwest` 0.13 (rustls + `rustls-platform-verifier`, system proxy) + `minisign-verify` | Never `tauri-plugin-http`/`-upload` (second reqwest, bundled roots that ignore corporate CAs) |

Adding any new runtime dependency requires a one-line justification in the commit message.
Prefer small, tree-shakeable libraries. The webview never touches the network (see §6).

## 2. Repository layout

```
src/
  app/            Shell: layout, menu bar, toolbar, status bar, shortcuts
  components/ui/  shadcn/ui generated primitives
  features/       One folder per feature, each owning its components + hooks
    viewport/     R3F canvas, camera, controls, grid, lighting, picking
    physics/      Rapier world, bodies, joints, drag controller
    assembly/     Anchors, mates, snapping, assembly graph
    materials/    Material section of the inspector: picker, preset toolbar, editor, previews
    import/       Loaders, import dialog, workers
    schematic/    React Flow editor, node types, ports
    scene-graph/  Left sidebar tree
    properties/   Right sidebar inspectors
    library/      Library tab, insertion drag, credits dialog
    export/       GLB/STL export of the assembly or selection
    project/      New/Open/Save, dirty tracking, autosave, recovery, unsaved-changes prompt
  core/           PURE TypeScript. No React, no R3F, no DOM, no Tauri
    math/         Frames, transforms, fitting (three math types allowed)
    physics/      Drag spring, damping, joint tree, physics model from the document (no Rapier)
    assembly/     Anchor frames and snap candidates (Phase 7); mate math and the assembly graph
    materials/    Built-in presets (with density sources), material -> three params, slot looks
    geometry/     Asset preparation, GLB codec (v1/v2 slots), faces, feature edges, snap features
    sim/          Netlist compiler, MNA solver, signal propagation (no three.js at all)
    generators/   Parametric standard parts: <id>/v<major>.ts (pure, runs in a worker)
    schema/       zod schemas for scene.json, component.json, packs, catalog + migrations;
                  the open/save pipeline (limits, migrations, integrity checks)
    project/      Save-time GC and other pure project-file logic
    units.ts      The only place unit conversions live
  store/          Zustand slices + selectors
  lib/tauri/      Typed wrappers for every Tauri command/plugin call
  workers/        Web Worker entry points
src-tauri/src/
  commands/       #[tauri::command] handlers (thin; delegate to modules)
  bundle/         Zip guard + deterministic writer (shared with library packs), `.stvd` format
  project/        Open project state: workspace swap, save, recent files, title, close guard
  workspace/      Per-project working directory, sweep, crash recovery
  picked/         Files the user chose in a dialog or dropped (opaque tokens for the webview)
  geometry/       Convex decomposition (parry3d) and other heavy geometry
  library/        Component store, install, signature verification, downloads
tests/e2e/        Playwright specs
docs/research/    Research behind PLAN.md decisions (not shipped; values need re-verification)
```

## 3. Code rules

- **File size: max ~200 lines per file** (components, hooks, and modules alike). Over that,
  split it. Generated shadcn files are exempt.
- One exported React component per file. A small private presentational helper used only in
  that file (a table row, a divider) may sit beside it; anything with state, effects or logic
  gets its own file. Named exports only (no default exports, except where a tool requires one).
- Components render; they do not own business logic. Logic goes in `core/` (pure, unit
  tested) or in store actions.
- `src/core/**` must not import React, R3F, drei, DOM APIs, or `@tauri-apps/*`.
  `src/core/sim/**` must not import three.js either.
- **Never import `@tauri-apps/api` or plugins outside `src/lib/tauri/`.** This keeps the
  UI runnable in a plain browser for E2E tests with mocked IPC.
- These boundaries are linted on the *resolved* import target (relative paths, dynamic
  `import()`, re-exports) by `tools/eslint/boundaries.js`, plus restricted DOM/Tauri globals
  and no JSX in `src/core`. Lint catches mistakes; it is not a sandbox.
- No `any` (use `unknown` + narrowing). No non-null assertions without a comment saying why.
- No `eval`, `new Function`, or string-to-code. User-defined block behaviour uses a sandboxed
  expression parser.
- IDs are opaque strings (`crypto.randomUUID()`), typed with branded types (`PartId`, `AnchorId`, ...).
  The schema accepts only lowercase UUIDs as minted ids; files are keyed by their SHA-256.
- Look entities up with `Object.hasOwn` (a record also "has" `toString`).
- Rust: no `unwrap()`/`expect()` in command paths. Return `Result<T, AppError>` where
  `AppError` serializes to a typed error for the frontend.

## 4. State management rules

Four kinds of state. Do not mix them.

1. **Document state** (persisted to `scene.json`, undoable via `zundo`): assets, parts,
   design-pose transforms, materials, anchors, mates, schematic nodes/edges, bindings,
   simulation settings. Normalized: `Record<Id, Entity>`.
2. **Session state** (Zustand, not persisted, not undoable): selection, active tool, camera
   projection, panel layout, test-mode flag, simulation *results*.
3. **Transient per-frame state** (plain mutable objects or refs, **never Zustand**): live
   physics poses, drag targets, hover candidates. Read in `useFrame`, sampled when needed.
   Test mode writes poses straight into the parts' scene objects (`partObjects.ts`) after
   every step; the viewport hover is a tiny observable (`hoverStore.ts`), not Zustand.
4. **Preferences** (per machine, not per project; Zustand persisted to the webview's
   localStorage, zod-validated, every access guarded): mouse navigation preset, zoom
   settings. Never in `scene.json`, never undoable.

Further rules:
- Subscribe with narrow selectors (`useStore(s => s.parts[id])`, `useShallow` for objects).
- Continuous gestures (gizmo drags, node drags, slider scrubs, typing in an inspector) must
  produce **one** undo entry: `documentHistory.beginGesture()` on start returns a token, and
  only that token can end or cancel the gesture. An unchanged document adds no entry (and
  gets its start object back, so it does not read as an unsaved change).
- **scene.json is the contract.** Store actions never produce a document that Open would
  refuse: inserts run the integrity rules, and `documentContract.test.ts` round-trips every
  action. Changing what a saved file means needs a `vN → vN+1` migration (`migrate.ts`) and
  a frozen fixture; a collection a later phase owns stays gated empty until then.
- Unsaved changes = the document is not the object last saved or opened (reference compare;
  immer and zundo keep that exact). Anything replacing the document goes through the project
  controller (`features/project`): one operation at a time, the unsaved-changes prompt, then
  `switchDocument` (history cleared, session state reset, unused geometry freed).
- Session state that points into the document (selection) is pruned when the document
  changes (undo, redo, delete, open), so commands never act on entities that no longer exist.
- Never use a React `key` to force-remount layout containers (panels, the 3D canvas, the
  schematic). A remount destroys the WebGL context and every GPU resource, and resets panel
  sizes and tabs. Show/hide through the panel API (collapse/expand) plus `inert`.
- Never put geometry buffers, textures, or three.js objects in the store. Store asset IDs.
- Materials: one shared `MeshPhysicalMaterial` (and X-ray variant) per document material
  (`viewport/materials/materialCache.ts`). Edits reach it in place through `MaterialSync`, so
  a slider scrub re-renders no part components; parts re-resolve only when their own
  assignments, their loaded slots or the display mode change.
- Simulation results live in the session store keyed by node/port ID, not inside React Flow
  node `data` (that would re-render the whole graph on every solve).

## 5. Units, coordinates, transforms

- **Geometry/scene unit: millimetre.** Imports are converted at import time (GLTF metres x1000;
  STL/OBJ unit chosen in the import dialog, default mm; STEP via occt `linearUnit: millimeter`).
- **Simulation unit: SI** (m, kg, s, N, V, A, Pa, ...). Convert only through `src/core/units.ts`.
- World is **right-handed, Y-up** (three.js default). Z-up sources are rotated at import.
- Part transforms are **rigid only** (position + quaternion). Scale is baked into geometry at
  import, never applied to parts (it breaks colliders and anchor frames).
- Millimetre coordinates stay within ±1e8 mm (`MAX_COORDINATE_MM`, 100 km): the schema
  refuses more, so mm fields use `Vec3MmSchema` and import refuses larger models.
- Rapier world gravity is **zero**. Gravity exists only in the simulation solver.
- The Rapier world is in **mm, kg, s** (forces in kg·mm/s², inertia in kg·mm²); conversions go
  through `units.ts`. Its settings (`physicsConfig.ts`: 120 Hz steps, `lengthUnit` 10, 5 mm
  predictive contacts) came from measured sweeps: change them only with the headless rig
  tests (`hingeRig.test.ts`) passing.
- Rapier bodies start with an **identity rotation** at the part's position; the part's
  rotation goes on its collider and the visual pose is body ∘ design rotation. Rapier's
  revolute `JointData` uses one local axis for both bodies, so rotated bodies would jump.
- Joints: **multibody** for the spanning tree (exact hinges), impulse joints only to close
  loops (`core/physics/jointTree.ts`). Rapier ignores body damping on multibody links, so
  damping is applied as forces before every step.

## 6. Rendering & performance rules

- Target: up to **200 parts**, ~2-3 M triangles total, 60 fps orbit on an integrated GPU.
  No LOD/instancing work unless profiling proves it is needed.
- Canvas uses `frameloop="demand"` in design mode (call `invalidate()` after changes);
  `"always"` only while test mode is running.
- Heavy CPU work runs off the main thread: STEP/IGES parsing (worker), simulation solve
  (worker), convex decomposition (Rust).
- **Offline-first.** The webview makes **no** network requests, ever. Do not use drei
  `Environment` presets (they fetch HDRIs from a CDN) or drei's `useGLTF` DRACO (gstatic).
  three's `DRACOLoader` gets `DRACO_GLTF_CONFIG` (its own decoder files, bundled by Vite).
  Bundle decoders, fonts, and environment maps locally.
- The **only** network access in the app is the Rust library downloader, and only on an
  explicit user action (Browse, Refresh, Download, Check for updates) or an opt-in periodic
  check (off by default). No startup network traffic. An "Offline mode" switch disables it.
- Appearance (Phase 6): a slot draws the part's override for it, else the part's material,
  else the imported colour, else the default (`core/materials/slotLooks.ts`). Transparent
  materials go to the sorted transparent pass without depth writes; only transmission (glass)
  uses three's transmission pass (half resolution). Never set `renderOrder` on parts: the
  grid (-1), tint (1), stencil silhouette (2) and outline (3) rely on parts at 0; each
  highlighted part masks its outline with its own stencil bit (`stencilBits.ts`). Texture
  maps are triplanar in part-local mm (assets have no UVs), loaded at most 2048 px, decoded
  one at a time, once per image for both uses, within a pixel budget per project.
- Display modes: feature edges are computed once per asset in the asset worker and drawn as
  `LineSegments` over the asset's own position buffer (dispose them only with the asset: it
  would free the shared buffer). Part meshes raycast with `partRaycast` (front faces, one
  material) so picking is the same in every mode; wireframe hides faces with `visible`.
- Material previews render with the 3D view's own renderer into its canvas (no second
  WebGL context) and are read in the same task; never render previews to a render target
  (r186 skips tone mapping and the output colour space there).
- A frame drawn outside the render loop (thumbnail, previews, probe reads) goes through
  `renderer/redrawNow.ts`, never a bare `state.advance()`: R3F counts down the controls'
  own `invalidate` at the end of a manual frame, which freezes a camera move mid-way.
- Large binaries never cross IPC as JSON. Assets live in the project workspace dir and are
  loaded through the `stvd` URI scheme (Rust serves `<sha256>.glb` from the workspace only);
  writes use raw binary IPC payloads.

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
| `grid-minor` / `grid-major` | `#CBD5E1` / `#94A3B8` (slate-300/400) | 3D ground grid lines | decorative |
| `axis-x` / `axis-y` / `axis-z` | `#DC2626` / `#15803D` / `#2563EB` | 3D axes, triad | >=3.92:1 on the viewport gradient; white labels >=4.83:1 |

**Schematic domain colours** (wires, port glyphs; each >=3:1 on white). Colour is never the
only cue: each domain also has a distinct line pattern and port shape.

| Domain | Hex | Line |
|---|---|---|
| Electrical (V, I) | `#EA580C` (orange-600) 3.56:1 | solid |
| Mechanical (F/v, tau/omega) | `#475569` (slate-600) 7.58:1 | thick solid |
| Fluid / pressure (p, mass flow) | `#0D9488` (teal-600) 3.74:1 | long dash |
| Light (flux) | `#A16207` (yellow-700) 4.92:1 | dotted |
| Data / signal | `#7C3AED` (violet-600) 5.70:1 | short dash |

Never put `muted-foreground` text on `accent` or `secondary` surfaces (4.15:1 and 4.34:1, below
AA); selected rows use `accent-foreground`. `--muted` is slate-50 (not slate-100) for this reason.

Keyboard: all shortcuts go through the command registry (`src/app/commands`). In text fields and
open menus/dialogs only commands marked `allowInTextInput` fire; Escape on the menu bar only
releases focus. Never add a raw `keydown` listener for an app shortcut.

Composite widgets (tree, toolbar, tabs, menus) follow their WAI-ARIA pattern: one tab stop
(roving tabindex) and arrow keys inside. The widget handles and `preventDefault`s only its own
keys (arrows, Home/End, Space/Enter); everything else (Delete, Escape, Ctrl+...) bubbles to the
registry. Disabled toolbar items use `aria-disabled`, not `disabled`, so they stay focusable
and the tooltip can say why. Dialogs return focus to whatever opened them.

3D code reads colours only through `src/features/viewport/theme/sceneTokens.ts`, which reads
these CSS variables. Overlay materials (grid, gizmos, highlights) set `toneMapped: false` so
they show the exact token under Neutral tone mapping.

Focus rings use the full `ring` token, never an opacity variant (`ring-ring/50` falls below
3:1). Sky-600 is 4.10:1 on white, 3.91:1 on `surface` and 3.57:1 on `accent`.

UI density: this is a desktop tool. Use compact sizes (`text-xs`/`text-sm`, 28-32 px
controls), `tabular-nums` for numeric readouts, Inter (bundled locally) for UI text.
No hard-coded hex values in components; use Tailwind theme tokens.

## 8. Commands & verification

- `npm run dev`: Vite dev server only (browser, no Tauri APIs; backend calls return `unavailable`)
- `npm run tauri dev`: full desktop app
- `npm run lint` / `npm run typecheck` / `npm test` (Vitest) / `npm run check` (all three)
- `npm run format` / `npm run format:check` (Prettier; Markdown is excluded to protect LaTeX)
- `npm run test:e2e`: Playwright against the dev server with a mocked Tauri backend
  (`tests/e2e/fixtures.ts`). `E2E_BROWSERS=chromium,webkit` runs WebKit too (CI does).
- `npm run build`: typecheck + production frontend build
- `cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`

Before every commit: lint, typecheck, unit tests, and `cargo clippy`/`cargo test` must pass.
Before closing a phase: also E2E and a full `npm run build`. Physics and solver behaviour is
tested headlessly (Rapier and the solver run in Node), not by eyeballing the viewport.
CI (`.github/workflows/ci.yml`) runs all of this on Linux, plus the Rust checks on Windows.

Testing notes:
- jsdom gives every element a 0×0 rect at (0,0), so react-resizable-panels treats any simulated
  pointer press as a hit on a resize handle and steals focus. Component tests focus inputs
  programmatically; real-mouse flows belong in Playwright.
- A regression test must be shown to fail without its fix before it counts.
- The E2E Tauri mock (`tests/e2e/tauriMock.ts`) has an in-memory file system: tests queue
  picked or dropped files, assets the app writes come back through `convertFileSrc`, and
  exports are kept for inspection. Project commands live in `tauriProjectMock.ts` (a second
  init script): saved scenes stay on an in-memory "disk"; state needed before the app starts
  (recovery, a launch file) is seeded through `sessionStorage` and a reload. Keep both in
  step with `src/lib/tauri`.
- After an import, wait for the Import dialog to be hidden before querying the rest of the
  app: Radix keeps it `aria-hidden` until the exit animation ends, and on a GPU-less runner
  the first render of new parts can hold the main thread for seconds.
- `tauri dev` uses its own single-instance D-Bus name on Linux; on Windows it shares the
  installed app's mutex, so close an installed StudioVD before `tauri dev`.
- Vite's dev dependency scan does not follow `new Worker(...)`; workers are listed in
  `optimizeDeps.entries` (`src/workers/*.worker.ts`). Without that, the first import
  re-optimizes and reloads every open page, which breaks parallel E2E runs.
- The dev probe (`window.__STUDIOVD_VIEWPORT__`) reads real pixels (`pixelAt`,
  `highlightPixels`) and how parts are drawn (`partLook`: materials per slot, edges, faces
  shown). CI renders with SwiftShader: assert pixel relations with tolerances, not images.
- Do not verify a commit in a `git worktree` whose `node_modules` is a symlink to the main
  checkout: the shared Vite dep cache is re-optimized for the other root and pages reload
  mid-test (an import then looks lost). Run E2E in the main checkout.
- `@playwright/test` is pinned to 1.56.1 because the dev sandbox ships Chromium build 1194. CI
  installs browsers itself, so bumping it only breaks local sandbox runs.
- shadcn/ui: components in `src/components/ui/` come from `shadcn-ui/ui@e94cebe`
  (`apps/v4/registry/new-york-v4/ui`), with `cn`/registry imports rewritten to `@/lib/utils`
  and `@/components/ui`. Add more with `npx shadcn@latest add <name>` on a normal network.
  Local edits to keep when re-adding a component: full-opacity `ring-2` focus rings, the
  menubar trigger focus ring, menu shortcuts in `accent-foreground` on highlighted items, and
  the switch's unchecked track in `muted-foreground` (`input` is 1.48:1, below 3:1).

Linux dev needs: `libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.

## 9. Security

- Tauri capabilities are least-privilege; fs access scoped to the project workspace, app
  data/cache dirs, and paths the user picked in a dialog.
- Zip extraction (`.stvd` and `.stvdpack`) goes through `src-tauri/src/bundle/guard.rs`, never
  `ZipArchive::extract`: our own EOCD read, contiguous layout (no prefix, gaps, overlaps,
  trailing data, ZIP64 or data descriptors), safe ASCII names (no absolute paths, `..`,
  backslashes, Windows device names), regular files only, case-insensitive duplicates and
  file/folder clashes rejected, byte-counted size and compression-ratio limits, CRC read to
  the end, a fresh destination folder. Every content-addressed file is checked by SHA-256.
- **Library packs are data only.** Allowed files: JSON, GLB, PNG, JPG, TXT. No SVG, HTML,
  scripts, or GLB buffers/images with external or `data:` URIs. Behaviour comes only from
  app-built-in model/generator/symbol IDs or the sandboxed expression parser.
- Trust comes only from signatures: the catalog index is verified with compiled-in minisign
  keys before it is parsed; every pack and file is checked by SHA-256. Hosts and mirrors are
  untrusted. Library commands take IDs, never URLs or file paths from the webview.
- **No paths from the webview, ever.** Open/save dialogs run in Rust and drops are registered
  in Rust; the webview gets opaque tokens (read and write tokens are not interchangeable).
  A model's token reads only the files the model itself names, inside its folder. Asset
  writes are verified against their SHA-256. Tauri's asset protocol stays off (Tauri widens
  its scope for every dropped file or folder); the `stvd` scheme serves content addresses.
  The open project's path, recent files, launch files and recovery candidates stay in Rust:
  the webview sees file names, ids and tokens. Saving zips only files `scene.json` names
  as `<dir>/<sha256>.<ext>`, each re-hashed.
- Texture images are chosen in a Rust dialog and checked from their headers before anything
  decodes them (PNG IHDR or JPEG SOF, at most 8192 px a side and 16 MiB; a JPEG is walked
  marker by marker to its end and refused unless well formed, with one frame and at most 32
  scans, since decoders skip stray bytes and could read another frame), stored as
  `textures/<sha256>.<png|jpg>` and served by the `stvd` scheme with image types; opening a
  `.stvd` checks them the same way. Asset GLBs are read strictly (v1, or v2 with one
  primitive per material slot); slot names are re-validated, never trusted.
- Every `component.json`, including those inside an opened `.stvd` (a project file is
  untrusted input), passes the same strict zod validation.
- A strict CSP replaces `"csp": null` before release (Phase 15).

## 10. Git

- Small, focused commits with descriptive messages (`feat(viewport): ...`, `fix(physics): ...`).
- Phase work happens on the designated feature branch; no PRs unless asked.

## 11. Product decisions (see `PLAN.md` §5)

- Project files: `.stvd` (zip). App identifier: `com.studiovd.desktop`.
- Simulation: steady state only (v1). Simulation drives visuals only; it never moves parts.
- Default mouse mapping: SolidWorks-style (middle-drag orbit, Ctrl+middle pan, wheel zoom).
- Component library: model packs are download-only (never in the installer); generator code,
  simulation models and symbols ship in the app. Inserted components are copied into the
  project, so a `.stvd` never depends on the library being installed.

## 12. Content & licensing rules

- **Never copy GPL/LGPL code or geometry into the app or official packs** (NopSCADlib, BOLTS,
  KiCad generator scripts, FreeCAD Fasteners). Facts (dimensions) may be cross-checked against
  them; tables are written by us from the standards.
- Official pack content must be one of: CC0-1.0, CC-BY-3.0, CC-BY-4.0, CC-BY-SA-4.0
  (± KiCad-libraries-exception), MIT, BSD-2/3-Clause, Apache-2.0. Never re-host models from
  McMaster-Carr, TraceParts, GrabCAD or 3D ContentCentral.
- Every geometry asset carries licence metadata (SPDX, creators, source @ pinned revision,
  modifications). Attribution travels into every `.stvd` (`licenses/`) and every export.
- Every datasheet number carries a source and a confidence level. Never invent values; mark
  unknowns as unknown. Numbers in `docs/research/` are leads to re-check, not facts.
