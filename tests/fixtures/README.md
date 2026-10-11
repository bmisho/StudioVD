# Test fixtures

All files here are CC0-1.0, written for StudioVD's tests (no third-party geometry).

| File | Made by | Contents |
|---|---|---|
| `cube.step` | `tools/fixtures/makeCubeStep.mjs` | 10 mm cube as a faceted B-rep, AP214 |
| `bracket.stl` | `tools/fixtures/makeBracketStl.mjs` | L-bracket, 6500 mm³, binary STL |
| `sample.glb` | `tools/fixtures/makeSampleGlb.mjs` | Two parts under an "Assembly" node, metres |
| `sample-draco.glb` | `npx @gltf-transform/cli@4.2.1 draco sample.glb sample-draco.glb` | `sample.glb` with `KHR_draco_mesh_compression` |
| `sample-meshopt.glb` | `npx @gltf-transform/cli@4.2.1 meshopt sample.glb sample-meshopt.glb` | `sample.glb` with `EXT_meshopt_compression` + `KHR_mesh_quantization` |

The two compressed files were produced once (glTF-Transform v4.5.1 core) and are committed
as-is; regenerate them only if `sample.glb` changes.
