# Component format (`component.json`, `.stvdpack`, catalog index)

One format for every library component: downloaded from the catalog, made by a built-in
generator, or saved by a user ("Save as component"). The normative definitions are the zod
schemas in `src/core/schema/component/` (`manifest.ts`, `pack.ts`, `catalogIndex.ts`); the
Rust side checks pack layout and hashes (`src-tauri/src/library/`). This page explains them.

## `component.json`

An abridged example (the full one is the test fixture
`src/core/schema/testing/fixtures/library/component-asset.valid.json`):

```json
{
  "format": "studiovd-component",
  "schemaVersion": 1,
  "identity": {
    "id": "acme/knob-15mm", "version": "2.1.0", "name": "Knob 15 mm",
    "category": ["mechanical", "knobs"], "tags": ["knob", "d-shaft"],
    "vendor": "Acme", "mpn": "KN-15", "requires": { "app": ">=0.1.0 <2.0.0" }
  },
  "parts": {
    "body": {
      "name": "Knob",
      "geometry": { "kind": "asset", "sha256": "…", "path": "geometry/<sha256>.glb",
                    "bytes": 20480, "triangles": 1200, "bboxMm": { "min": [-7.5, -7.5, -6], "max": [7.5, 7.5, 6] } },
      "transform": { "positionMm": [0, 0, 6], "quaternion": [0, 0, 0, 1] },
      "material": "abs"
    }
  },
  "rootPart": "body",
  "materials": {
    "abs": { "kind": "inline", "name": "Black ABS", "color": "#1a1a1a", "densityKgM3": 1040, "…": "…" },
    "chrome": { "kind": "builtin", "key": "std.stainless-304" }
  },
  "anchors": {
    "shaft": { "part": "body", "name": "Shaft hole", "kind": "axial",
               "frame": { "originMm": [0, 0, -6], "z": [0, 0, -1], "x": [1, 0, 0] },
               "interface": "bore-6mm" }
  },
  "mates": {},
  "suggestedMates": [],
  "placement": { "groundIfFirst": true },
  "thumbnails": [],
  "license": { "geometry": { "spdx": "CC-BY-4.0", "creators": [{ "name": "Acme Ltd" }], "…": "…" },
               "data": { "spdx": "CC0-1.0", "…": "…" } },
  "authoring": { "kind": "pipeline", "tool": "studiovd-pack-builder", "toolVersion": "1.0.0",
                 "builtAt": "2026-10-26T09:00:00Z" },
  "schematic": { "block": "<model id>@<major>", "params": {} },
  "bindings": []
}
```

- **Identity**: `<namespace>/<slug>` and a SemVer version. `official`, `gen`, `builtin` and
  `studiovd` are reserved: only a signed catalog (or the app's own generators) may use them.
  User components get the installation's `u-xxxxxx` namespace. `requires.app` is a range; a
  component for a newer StudioVD is listed as such and cannot be inserted.
- **Parts** (1-64): geometry is a content-addressed GLB in the pack (`kind: "asset"`) or a
  built-in generator call (`kind: "generated"`, its generator and major listed in
  `requires.generators`). Local keys (`body`, `bore`) name everything inside the manifest; a
  placed instance maps them to document ids, which is how Update keeps mates to a component.
- **Anchors** (up to 512) and **mates** (up to 128) are in part-local mm; `interface` tags
  drive snapping on insert. **Placement** says which anchor lands on the cursor and whether
  the root part is grounded when it is the first thing in a project.
- **Schematic** (optional): the built-in block (`<model>@<major>`) it creates on insert and
  that block's parameter values; the block is linked to the placed component.
- **Bindings** (optional, up to 32): links between its own parts, anchors, mates and block;
  a `contactSlot` asks the user for a part outside the component.
- **Licence**: separate grants for geometry, data and thumbnail (SPDX, creators, source URL
  at a pinned revision, modifications, the licence text by SHA-256, `attributionRequired`,
  `redistributable`), and `inherited` grants for components built from library parts; they
  can never be dropped and travel into every project and export.

Every number is finite, every vector unit length where it must be, every record capped, and
`__proto__`, `constructor` and `prototype` are refused as keys anywhere.

## Packs (`.stvdpack`)

A zip (same guard as `.stvd`) holding:

```text
pack.json                                         every file with its SHA-256 and size
components/<ns>/<slug>/<version>/component.json   one per component
components/<ns>/<slug>/<version>/thumbnail.png    at most 512 px
geometry/<sha256>.glb                             no external or data: URIs
textures/<sha256>.png|jpg
licenses/<sha256>.txt
```

Only JSON, GLB, PNG, JPG and TXT are allowed; an entry `pack.json` does not list, or one whose
hash or size differs, refuses the whole pack. Identical blobs are stored once in the library.

## Catalog index (`index.json`)

The signed list of what the online catalog offers (`catalogIndex.ts`): catalog id, a strictly
increasing `sequence`, `generatedAt`/`expiresAt`, `minAppVersion`, the signing key id,
mirrors, categories, one summary per component (name, tags, domains, licence, triangle count,
its pack, its manifest's SHA-256, its thumbnail), packs by SHA-256 (relative URL, size,
uncompressed size, entries), bundles (named sets of components in one pack), preview packs per
category, generator presets, revocations and notices. It is at most 16 MiB and is verified with
a minisign signature whose trusted comment binds catalog, sequence and schema before anything
parses it; see `docs/catalog-signing.md`.
