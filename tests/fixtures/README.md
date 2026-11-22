# Test fixtures

All files here are CC0-1.0, written for StudioVD's tests (no third-party geometry).

| File | Made by | Contents |
|---|---|---|
| `cube.step` | `tools/fixtures/makeCubeStep.mjs` | 10 mm cube as a faceted B-rep, AP214 |
| `cube-colours.step` | `tools/fixtures/makeCubeStep.mjs` | The same cube: grey body, +x and -z faces red, +y blue (STYLED_ITEMs) |
| `plate-hole.step` | `tools/fixtures/makePlateStep.mjs` | 40 × 8 × 30 mm plate lying flat (y up) with a Ø8 mm through hole at x = 5; advanced B-rep, the bore as two half cylinders |
| `pin.step` | `tools/fixtures/makePinStep.mjs` | Ø8 × 20 mm pin standing on y = 0..20 at x = 40, z = 0 (fits the plate's hole); advanced B-rep, the side as two half cylinders |
| `checker.png` | `tools/fixtures/makeCheckerPng.mjs` | 64 px checkerboard (8 px squares) for texture maps |
| `bracket.stl` | `tools/fixtures/makeBracketStl.mjs` | L-bracket, 6500 mm³, binary STL |
| `sample.glb` | `tools/fixtures/makeSampleGlb.mjs` | Two parts under an "Assembly" node, metres |
| `sample-draco.glb` | `npx @gltf-transform/cli@4.2.1 draco sample.glb sample-draco.glb` | `sample.glb` with `KHR_draco_mesh_compression` |
| `sample-meshopt.glb` | `npx @gltf-transform/cli@4.2.1 meshopt sample.glb sample-meshopt.glb` | `sample.glb` with `EXT_meshopt_compression` + `KHR_mesh_quantization` |
| `large.glb` | `tools/fixtures/makeLargeGlb.mjs` | `sample.glb` ×40 (2 m plate, 4 m from the origin), names with spaces, dots and brackets |
| `textured.glb` | `tools/fixtures/makeTexturedGlb.mjs` | 20 × 2 × 20 mm plate whose material embeds `checker.png` (a blob: URL in three's loader; the release CSP test) |
| `large-meshopt.glb` | `npx @gltf-transform/cli@4.2.1 meshopt large.glb large-meshopt.glb` | `large.glb` quantized: world coordinates over 1 m |

The compressed files were produced once (glTF-Transform v4.5.1 core) and are committed
as-is; regenerate them only if their source changes.
