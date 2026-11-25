# Catalog content pipeline (PLAN 14.7)

Official packs are built from KiCad's libraries by `tools/packs` in this repository and
published by the catalog repository (`bmisho/studiovd-catalog`). The builder runs the app's
own code (`src/core`, the STEP importer) in Node, so a pack holds exactly what File › Import
would make of the same file.

## What the catalog repository holds

- `content/kicad/packs/<pack>.json`: pack recipes (`tools/packs/recipe.ts` is the schema). One
  per pack: its name, label, category, and per component the footprint (and model, when the
  footprint places several), names, tags, pin names with their source, the schematic block,
  and every number the component states (`data`, each with a source and a confidence).
- `content/kicad/lock.json`: the KiCad tag (`10.0.7`) and the SHA-256 of every file the
  recipes need (footprints, models, `LICENSE.md`, the model folders' `CREDITS.md`).
  `node tools/kicad-sources.mjs lock` rewrites it after a recipe or the tag changes;
  `fetch --out <dir>` downloads exactly those files and refuses any that differ.
- `catalog/app.json`: the StudioVD commit whose builder and install check the build uses.

## What a build does

```sh
node tools/kicad-sources.mjs fetch --out sources                 # catalog repo
node <app>/tools/packs/run.mjs /tools/packs/cli.ts \               # app checkout
  --recipes content/kicad/packs --sources sources --kicad-tag 10.0.7 \
  --tag packs-N --out dist/packs
node tools/merge-packs.mjs dist/packs/published.json              # catalog/packs.json
node tools/build-index.mjs --sequence 0 --key keys/active.pub     # validated, unsigned
STUDIOVD_CHECK_INDEX=dist/index.json STUDIOVD_CHECK_PACKS=dist/packs \
  cargo test --manifest-path <app>/src-tauri/Cargo.toml official_packs_install -- --ignored
```

Per component the builder:

1. reads the footprint (`footprint.ts`): pads, and where it places the model (offsets are
   applied; a rotated or scaled model is refused rather than guessed);
2. imports the STEP model with occt-import-js at "normal" quality, one part, Z-up turned Y-up,
   recentred, a material slot per colour (`stepAsset.ts`), and runs the Khronos glTF
   validator on the GLB (no errors or warnings allowed);
3. writes `component.json` (`kicadManifest.ts`): a `mount` anchor on the board face at the
   footprint origin, a port anchor per numbered pad (named from the recipe's pins), slot
   materials (plastic or metal looks of the built-ins, with their sourced densities), the
   schematic block, KiCad's licence for geometry and data with the pinned source URLs, and a
   description listing every stated value with its source; the app's schema checks it;
4. renders a 256 px thumbnail with three.js in headless Chromium, offline (`thumbnail.ts`);
5. adds a licence text: KiCad's `LICENSE.md`, the folder's `CREDITS.md`, and the STEP file's
   own header (its author and licence notice).

Each pack is a zip the app's strict reader accepts (`zipWriter.ts`: contiguous entries, no
data descriptors or ZIP64, safe names) with a `pack.json` listing every file's SHA-256, plus a
preview zip of its thumbnails. The cargo test then installs every pack through the app's
install path, vouched for by the index (Official), and every thumbnail through the preview
path; the index itself passed the app's JSON Schema and cross-checks first.

## Licences

KiCad's libraries are CC-BY-SA-4.0 with the KiCad libraries exception, which is on the
official allowlist (CLAUDE.md §12; `kicadLicence.ts` refuses anything else). The pack, as a
collection of library parts, is shared under the same licence with attribution kept (the
licence text above); designs that use the parts are covered by the exception. Converting
STEP to GLB is a format shift, and the modifications are stated in every grant.
