# StudioVD project file (`.stvd`, `scene.json` v3)

The normative definition is the zod schema in `src/core/schema/` (`document.ts` and the files
it imports) plus the cross-entity rules in `integrity.ts`; this page explains it. Every file is
read as untrusted input: an opened `.stvd` passes the same size limits, schema and integrity
checks whoever made it.

## The bundle

A `.stvd` is a zip (stored or deflated, no ZIP64, no data descriptors, no symlinks):

```text
scene.json                    the document (below), UTF-8 JSON, at most 64 MiB
thumbnail.png                 optional preview of the 3D view
geometry/<sha256>.glb         one normalized mesh per content address
textures/<sha256>.png|jpg     texture images (PNG or JPEG, at most 8192 px a side)
licenses/<sha256>.txt         licence texts of library components and their assets
```

The zip holds exactly the files `scene.json` names, each stored under the SHA-256 of its bytes
and re-hashed on save and open. Names are plain ASCII (no `..`, absolute paths, backslashes or
Windows device names); duplicate names differing only by case are refused.

## Units and frames

- Lengths in millimetres (`…Mm` fields), within ±1e8 mm. Angles in radians.
- World: right-handed, Y up. Simulation values (gravity, parameters) are SI.
- A **pose** is `{ positionMm: [x, y, z], quaternion: [x, y, z, w] }` (unit quaternion).
  Parts are rigid: scale is baked into the geometry at import.
- A **frame** is `{ originMm, z, x }` with unit, orthogonal `z` and `x` (part-local for anchors).

## Top level

```json
{
  "format": "studiovd",
  "schemaVersion": 3,
  "appVersion": "0.1.0",
  "units": { "length": "mm" },
  "project": { "name": "Lid hinge" },
  "assets": {}, "textures": {}, "materials": {}, "groups": {}, "parts": {},
  "anchors": {}, "mates": {}, "couplings": {},
  "schematic": { "nodes": {}, "edges": {}, "blockDefs": {} },
  "bindings": {}, "componentDefs": {}, "components": {}, "licenseTexts": {},
  "connectors": {},
  "simulation": { "gravity": [0, -9.81, 0], "maxIterations": 100, "tolerance": 1e-9 }
}
```

Every collection is an object keyed by the entity's id (lowercase UUIDs; assets, textures and
licence texts by SHA-256; component definitions by `<id>@<version>#<12 hex>`). Unknown fields
are refused. Collection caps: 10 000 parts, assets and groups; 40 000 anchors; 20 000 mates;
5 000 couplings, components and connectors; 10 000 bindings; 1 000 materials, textures,
definitions and licence texts; 5 000 schematic nodes, 20 000 edges.

## Entities

| Collection | Holds |
|---|---|
| `assets` | `{ id, path: "geometry/<id>.glb", triangleCount, bboxMm, volumeMm3?, centroidMm?, watertight?, slots?, license? }`. `slots` names the GLB's material slots (one primitive each). Library geometry carries its licence (SPDX, creators, source, `licenseText` by SHA-256). |
| `textures` | `{ id, path: "textures/<id>.png\|jpg" }` |
| `materials` | PBR values (`color`, `metalness`, `roughness`, `opacity`, `transmission`, `ior`, `thicknessMm`, `clearcoat`…, `emissive`), `densityKgM3`, optional texture `maps` (triplanar, part-local mm), optional `builtinKey` of a preset. |
| `groups` | Scene-tree folders: `{ id, name, parentId }`, at most 64 deep, no cycles. |
| `parts` | `{ id, name, assetId, parentId, pose, materialId, grounded, visible, collider: "hull"\|"decomposed"\|"box"\|"trimesh"\|"none", massOverrideKg?, comOverrideMm?, materialSlots?, componentRef? }` |
| `anchors` | `{ id, partId, kind: "point"\|"planar"\|"axial", frame, name?, interface?, source }`; `source` says whether it came from a face, a vertex, by hand, or from a component. |
| `mates` | `{ id, type: "fixed"\|"revolute"\|"prismatic"\|"spherical", anchorA, anchorB, flip, angleOffsetRad, limits?, contactsEnabled, suppressed }`. Revolute limits in radians within a turn, prismatic in mm. |
| `couplings` | `{ id, kind: "gear"\|"rackPinion"\|"leadScrew", mateA, mateB, ratio }` (gear: speed ratio; the others: mm per radian). |
| `schematic.blockDefs` | A block type: `simModel` (`<id>@<major>` of a built-in model) or a black box with an expression `behaviour`, its `ports` and `params`, a built-in `symbol`. |
| `schematic.nodes` | `{ id, blockDefId, position, label, paramValues, componentInstanceId? }` |
| `schematic.edges` | Wires: `{ id, source, sourcePort, target, targetPort }`. The editor applies the domain rules when wiring; Open checks the ports exist. |
| `bindings` | 3D → solver and solver → 3D links: `from` (mate coordinate, gravity load, mass, contact, distance, range, light, block output), `to` (parameter, input, glow, tint, arrow, label, ghost), `scale`, `offset`, `min?`, `max?`. |
| `componentDefs` | The frozen `component.json` of every library component used (see `component-format.md`), its origin and manifest SHA-256. |
| `components` | Placed instances: `{ id, def, designator, groupId, parts, anchors, mates, materials, bindings, nodeId?, unlinked? }`, each map from the manifest's local keys to document ids. |
| `licenseTexts` | `{ path: "licenses/<sha256>.txt", spdx }` |
| `connectors` | Belts, tubes and springs between anchors (v2), and cables (v3: two ends, waypoints in order, the length as cut, diameter, one wire or a twisted pair, how spare length lies). Their meshes are derived, never stored. |

## Integrity rules (beyond the schema)

References resolve (a part's asset, a mate's anchors, a node's block definition…), no group
cycles, a mate joins two different parts, a wire names ports its blocks have (never a port to
itself, never twice), a bound input has no other driver, component instances list exactly what points back at them,
every file a record names exists in the bundle, and licence texts named by assets and
definitions are present.

## Versions

`schemaVersion` 1 → 2 added `connectors`; 2 → 3 added the `cable` kind (a v2 file has none,
so it opens unchanged). Opening an older file migrates it in memory (`migrate.ts`); a newer one
is refused with "made by a newer StudioVD". Frozen fixtures (`src/core/schema/testing/fixtures`:
`phase5-v1.scene.json`, `phase9-v2.scene.json`) must keep opening.
