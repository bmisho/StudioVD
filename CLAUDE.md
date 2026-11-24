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
    assembly/     Anchors (Place Anchor tool, glyphs, picking), mates, snapping, assembly graph
    materials/    Material section of the inspector: picker, preset toolbar, editor, previews
    import/       Loaders, import dialog, workers
    schematic/    React Flow editor, node types, ports
    scene-graph/  Left sidebar tree
    properties/   Right sidebar inspectors
    library/      Library tab, insertion drag, credits dialog; online/ catalog, packs, network
                  settings (Phase 14)
    export/       GLB/STL export of the assembly or selection
    simulation/   Solver scheduling (worker), results popover
    bindings/     Binding editor, sampler at the drawn poses, live watch, 3D visual store
    examples/     Help › Examples, built from generated parts
    project/      New/Open/Save, dirty tracking, autosave, recovery, unsaved-changes prompt
  core/           PURE TypeScript. No React, no R3F, no DOM, no Tauri
    math/         Frames, transforms, fitting (three math types allowed)
    physics/      Drag spring, damping, joint tree, physics model from the document (no Rapier)
    assembly/     Anchor frames and snap candidates (Phase 7); mate math and the assembly graph
    materials/    Built-in presets (with density sources), material -> three params, slot looks
    geometry/     Asset preparation, GLB codec (v1/v2 slots), faces, feature edges, snap features
    sim/          Block models registry, connection rules, expression language; netlist
                  compiler, MNA solver, signal propagation (no three.js at all)
    schematic/    Block layout, built-in symbols, domain looks, SVG export (pure)
    bindings/     Binding sampler, light formula, box contact, visuals from results (pure)
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
  library/        Component store, install; online/ signed catalog, downloads, trust
  net/            Network settings, proxy plan (Windows registry), the one HTTP client
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
  expression parser. `zod` resolves to `core/schema/zodNoEval.ts` (jitless; vite alias), so
  zod never compiles parsers with `new Function` either.
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
  loops and past `MAX_MULTIBODY_LINKS` (16) links per multibody (`core/physics/jointTree.ts`:
  one of ~135 trapped Rapier's WASM). Rapier ignores body damping on multibody links, so
  damping is applied as forces before every step. `<Physics>` is paused: `PhysicsStepper`
  steps it, at most `MAX_STEPS_PER_FRAME` a frame, and leaves test mode if a step throws.
- Phase 10: fixed-mated parts are ONE body. Rapier 0.19.2's JS build: limits reach only
  sliders (`JointData` drops a hinge's), multibody hinges have no limit setter, and an impulse
  hinge beside a multibody one locks the pair; so limited hinges are impulse joints, or get our
  own stop past half a turn (`hingeLimits.ts`). `world.step` uses hooks only with an event
  queue. Couplings and hinge stops are forces before each step, never velocity edits. Live
  joint readings go to `jointReadings` (transient), never Zustand.
- File names in one folder never differ only by case (`tools/repo/caseCollisions.test.js`):
  Windows, the main target, cannot tell them apart and CI on Linux would not notice.

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
- Anchors (Phase 7): snap features (`core/geometry/snapFeatures.ts`) are computed once per
  asset in the asset worker, like feature edges; candidates (`core/assembly/snapCandidates.ts`)
  are pure and pixel-based. Glyphs are overlays in CSS px (`features/assembly/glyphs.ts` scales
  them every frame and picks anchors by screen distance): children of the part's group, never
  raycast, left out of bounds (`visiblePartsBox` skips overlays), thumbnails and exports.
  `PartsLayer` plans which anchors get glyphs for all parts at once (`core/assembly/glyphPlan.ts`,
  at most `MAX_GLYPHS`); per-part anchor lookups go through `anchorIndex.ts`, never a filter
  over every anchor per part (parts × anchors on every change).
  Overlays drawn over parts use `transparent: true` materials (three draws opaque, then
  transmissive, then transparent; only the last list honours their renderOrder after parts).
  No R3F `createPortal` for things that come and go: a portal keeps a root-store
  subscription after it unmounts. The preview is rendered by each `PartView`.
- Mates (Phase 8): parts move only through `core/assembly/mateSnap.ts` (`planSnap`: the side
  not fixed to the ground, with everything mated to it); the assembly graph (groups, DOF,
  issues) is computed once per document change via `features/assembly/useAssemblyGraph.ts`,
  never per component; the Mate tool's picks are session state (`mateDraft`).
- Generators (Phase 9): parts are built face by face (`core/generators/mesh`: one face per
  natural surface, own vertices per face, faces weld by bit-identical positions), every body
  closed, Y the axis of revolved parts; planar anchors face out of their face, axial anchors
  point out of the face something enters. Output goes through `prepareAsset` like imports.
  Never `Math.random` or time in a generator: same parameters, same geometry.
- Library (Phase 9): a component is inserted as ONE `insertEntities` batch from
  `core/library/instantiate.ts`; deletions keep instances true (`componentUpkeep.ts`). The
  insertion drag's state is a transient observable (`insertionPreview`), never Zustand; a
  click picks a component as its group unless it is the one entered (`enteredComponent`).
  Save as component (9.7) builds the manifest in `core/library/userComponent` and validates it
  with the download schema; Rust only checks and stores the files it names. Inherited licences
  travel in full in `license.inherited` and can never be dropped.
- Schematic (Phase 11): the React Flow canvas is store-controlled. Its nodes and wires are
  derived from the document (`useFlowElements`, cached per document object, so React Flow
  keeps its measurements); measured sizes are view state, selection is the app's one list,
  a drag is one gesture, Delete is Edit › Delete (React Flow's delete key stays off). Block
  geometry (size, port spots, symbol, label places) comes from `core/schematic/layout.ts`,
  never from measuring, so the canvas and the SVG export agree. No HTML5 drag and drop into
  the canvas (Tauri's file-drop handling takes those events on Windows): blocks are added
  from the toolbar. React Flow's attribution stays visible; its link must not navigate.
  Block parameters and black-box definitions change only through store actions that keep
  wires and values valid (`schematicRepair.ts`).
- Simulation (Phase 12): `core/sim/engine` compiles the schematic (`netlist.ts`), solves the
  conserved domains by Newton over MNA (`newton.ts`, `lu.ts`) and the signals in dependency
  order (`signals.ts`), alternating until both settle (`simulate.ts`). Each built-in model has
  a `Behaviour` in `engine/behaviours` (a test fails for a model without one); stamps go
  through `stampKit.ts` in port terms. Memories (relays, stalls, a blown fuse) travel in the
  result's `state` and are passed back into the next solve, never into the document. It runs
  in `simulation.worker.ts`, scheduled by `features/simulation` (debounced, 30 Hz while a
  gesture is open); results go to `simulationStore` (session), read through selectors that
  return the text shown, so a solve re-renders only what changed. gmin is on every net:
  known-answer tests allow for it (about nV on a kΩ divider).
- Bindings (Phase 13): 3D → solver goes through `core/bindings/sample.ts` at the poses drawn
  now (part objects in test mode); the solver's results come back as `simVisualStore` entries
  that each part's overlays read (glow, tint, arrows, labels, ghosts: overlays like the
  highlight, never picked, never in bounds or exports). The simulation never moves a part. A
  binding into an input is that input's one driver; deleting what a binding names deletes it,
  and component records forget bindings that went (`pruneComponents`).
- Catalog (Phase 14): only Rust goes online, only on an explicit action (Refresh, Download,
  Test connection, the opt-in weekly check), never offline and never before the consent the
  webview asks for once. The index is verified (compiled-in minisign keys, trusted comment
  bound to catalog/sequence/schema) before anything parses it, then validated again in the
  webview like any file; a pack is Official only when the verified index lists its SHA-256 and
  every manifest's. The official source in `library/online/source.rs` has the owner's keys
  (active first, then the offline backup; never add one without the owner) and reads
  `bmisho/studiovd-catalog`'s releases, which its publish workflow signs
  (`docs/catalog-signing.md`). `docs/formats/catalog-index.schema.json` is the JSON Schema copy
  of `CatalogIndexSchema` that repository validates with: regenerate it (a test fails until you
  do) and copy it there when the schema changes. Component Update reuses the
  key-matched `regenerateInstance`; Replace is remove + instantiate in one undo entry.
- Connectors (Phase 9.6, scene.json v2): belts, tubes and springs are documents of their end
  anchors only; their meshes are derived in the view (`core/connectors`, `ConnectorsLayer`)
  from the anchors' world frames, rebuilt when the signature changes, never stored, never in
  physics. Cables (Phase 16, v3) add waypoint anchors and the length the user set:
  `cableRoute.ts` is the taut route, `cableSlack.ts` lays spare length (arcs away from the
  surfaces, waves, a coil) so the drawn centreline is that length (±0.05 mm), and a cable
  shorter than its route is drawn taut and reported, never stretched. A deleted waypoint drops
  out of the route; a deleted end deletes the cable.
- R3F requests a frame when objects are added or changed, **not when they are removed**: a
  component whose objects can go away (unmount, conditional children) calls
  `renderer/useRedrawOnRemoval.ts`, or the demand frameloop keeps drawing them.
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
only cue: each domain also has a distinct line pattern and port shape (circle, square,
octagon, diamond, triangle, arrow; `core/schematic/domainLook.ts`). Inputs are hollow,
outputs and terminals filled.

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
  (`tests/e2e/fixtures.ts`). `E2E_BROWSERS=chromium,webkit` runs WebKit too (CI does). The
  `*-release-csp` projects run `csp.spec.ts` against a production build served with the CSP.
- `npm run build`: typecheck + production frontend build
- `npm run notices`: regenerate `public/third-party-notices.txt` (npm and Rust licences) after
  dependency changes; `STUDIOVD_PERF=1 npx playwright test perf.spec.ts`: the 200-part
  measurement (PLAN 15.3; add `E2E_GPU=1` on a machine with a GPU: headed, no SwiftShader)
- `cd src-tauri && cargo deny check`: advisories, licences, bans, sources (`deny.toml`; CI)
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
- `src/test/demandRoot.tsx` mounts R3F components in jsdom on a stand-in renderer with the
  demand frameloop and counts the frames they request (R3F's own on added or changed objects,
  and explicit invalidations) and root-store subscriptions held: the way to test that a change
  reaches the screen without WebGL.
- The dev probe (`window.__STUDIOVD_VIEWPORT__`) reads real pixels (`pixelAt`,
  `highlightPixels`) and how parts are drawn (`partLook`: materials per slot, edges, faces
  shown). CI renders with SwiftShader: assert pixel relations with tolerances, not images.
- Do not verify a commit in a `git worktree` whose `node_modules` is a symlink to the main
  checkout: the shared Vite dep cache is re-optimized for the other root and pages reload
  mid-test (an import then looks lost). Run E2E in the main checkout.
- `@playwright/test` is pinned to 1.56.1 (Chromium build 1194); CI installs that build itself.
  A sandbox that ships another Chromium runs E2E with
  `E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium` (`playwright.config.ts` passes it as the
  executable).
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
  Zips picked or dropped for import (downloads, PLAN 16.5) go through `picked/archive.rs`
  instead: any zip tool's output (data descriptors, ZIP64, folder entries, non-ASCII names),
  but only importable models and the files they name are written, under names that stay
  inside a fresh `<app cache>/imports` folder on Windows and Linux, byte-counted against
  per-file and per-archive limits, CRC-checked; the rest is reported as skipped by name.
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
- The release CSP lives in `tauri.conf.json` (self only, `'wasm-unsafe-eval'`, `blob:` workers
  and images, `ipc:`/`stvd:`); `csp.spec.ts` runs the production build under it in Chromium and
  WebKit and fails on any violation. Anything needing a new source changes both.
- App commands go through Tauri's ACL: a new `#[tauri::command]` goes in `generate_handler!`,
  `build.rs` and `capabilities/default.json` (`acl_tests.rs` checks all three); the webview
  gets no `core:default` and no plugin permissions.

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
