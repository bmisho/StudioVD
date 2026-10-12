// Writes tests/fixtures/large.glb: sample.glb scaled ×40 (a 2 m plate, the assembly 4 m from
// the origin) with names glTF loaders like to rewrite ("Plate 1.001"). CC0-1.0. The quantized
// copy is made with: npx @gltf-transform/cli@4.2.1 meshopt large.glb large-meshopt.glb
import { writeFileSync } from "node:fs"
import { sampleGlb } from "./makeSampleGlb.mjs"

writeFileSync(
  new URL("../../tests/fixtures/large.glb", import.meta.url),
  sampleGlb(40, ["Big Assembly", "Plate 1.001", "Peg [A]"])
)
console.log("wrote tests/fixtures/large.glb")
