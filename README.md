# StudioVD

Desktop 3D CAD assembly visualizer and interactive assembly simulator: import parts
(GLTF, OBJ, STL, STEP, IGES), apply PBR materials, place anchors, mate parts with mechanical
constraints, drag movable parts to test kinematics with collisions, and model electrical /
mechanical / fluid / light / data behaviour in an active node schematic.

Built with Tauri 2 (Rust) + React 19 + TypeScript, React Three Fiber, Rapier, React Flow,
Tailwind CSS + shadcn/ui, and Zustand.

- `PLAN.md`: architecture and phased implementation checklist
- `CLAUDE.md`: project rules, stack constraints, and design system

## Development

```bash
npm install
npm run tauri dev     # desktop app
npm run dev           # frontend only, in a browser (no Tauri APIs)
npm run build         # typecheck + production frontend build
```

Linux needs the WebKitGTK toolchain:
`libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`.
