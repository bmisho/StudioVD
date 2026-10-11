// Minimal typings for occt-import-js 0.0.23 (no types ship with it), from its README and
// output observed on CAx-IF STEP samples. Arrays are plain JS arrays, not typed arrays.
declare module "occt-import-js" {
  export interface OcctParams {
    linearUnit?: "millimeter" | "centimeter" | "meter" | "inch" | "foot"
    linearDeflectionType?: "bounding_box_ratio" | "absolute_value"
    linearDeflection?: number
    angularDeflection?: number
  }
  export interface OcctNode {
    name: string
    meshes: number[]
    children: OcctNode[]
  }
  export interface OcctMesh {
    name: string
    /** Linear RGB 0..1, when the file assigns one. */
    color?: [number, number, number]
    /** Inclusive triangle ranges of the source B-rep faces. */
    brep_faces: { first: number; last: number; color: [number, number, number] | null }[]
    attributes: { position: { array: number[] }; normal?: { array: number[] } }
    index: { array: number[] }
  }
  export interface OcctResult {
    success: boolean
    root: OcctNode
    meshes: OcctMesh[]
  }
  export interface Occt {
    ReadStepFile(content: Uint8Array, params: OcctParams | null): OcctResult
    ReadIgesFile(content: Uint8Array, params: OcctParams | null): OcctResult
  }
  const init: (overrides?: { locateFile?: (path: string) => string }) => Promise<Occt>
  // The package is CommonJS (module.exports = factory): its typing must be a default export.
  // eslint-disable-next-line no-restricted-syntax
  export default init
}
