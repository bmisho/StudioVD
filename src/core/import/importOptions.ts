import { z } from "zod"
import { LENGTH_UNITS, MM_PER_UNIT, type LengthUnit } from "@/core/units"

/** File formats the importer reads (PLAN 4.2). */
export const IMPORT_FORMATS = ["glb", "gltf", "obj", "stl", "step", "iges"] as const
export type ImportFormat = (typeof IMPORT_FORMATS)[number]

const EXTENSIONS: Readonly<Record<string, ImportFormat>> = {
  glb: "glb",
  gltf: "gltf",
  obj: "obj",
  stl: "stl",
  step: "step",
  stp: "step",
  iges: "iges",
  igs: "iges",
}

/** File dialog filter: every extension we accept. */
export const IMPORT_EXTENSIONS = Object.keys(EXTENSIONS)

export function formatOf(fileName: string): ImportFormat | null {
  const dot = fileName.lastIndexOf(".")
  if (dot < 0) return null
  return EXTENSIONS[fileName.slice(dot + 1).toLowerCase()] ?? null
}

/**
 * STEP/IGES tessellation presets for occt-import-js (bounding-box-relative linear deflection,
 * angular deflection in radians). "normal" equals occt's own default; measured on the CAx-IF
 * as1 assembly: coarse 2868, normal 5040, fine 10848 triangles.
 */
export const STEP_QUALITY = {
  coarse: { linearDeflection: 0.003, angularDeflection: 0.8 },
  normal: { linearDeflection: 0.001, angularDeflection: 0.5 },
  fine: { linearDeflection: 0.0003, angularDeflection: 0.2 },
} as const
export type StepQuality = keyof typeof STEP_QUALITY

export const ImportOptionsSchema = z
  .object({
    /** Unit of formats that do not state one (STL, OBJ). glTF is metres, STEP/IGES carry theirs. */
    unit: z.enum(LENGTH_UNITS),
    upAxis: z.enum(["y", "z"]),
    quality: z.enum(["coarse", "normal", "fine"]),
    /** One part per mesh (and per STEP body), or the whole file as one part. */
    split: z.enum(["perMesh", "single"]),
  })
  .strict()
export type ImportOptions = z.infer<typeof ImportOptionsSchema>

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  unit: "mm",
  upAxis: "y",
  quality: "normal",
  split: "perMesh",
}

/** Whether the unit choice applies: other formats define their own units. */
export const formatNeedsUnit = (format: ImportFormat): boolean =>
  format === "stl" || format === "obj"

/** Millimetres per source unit for a file of this format under these options. */
export function mmPerUnit(format: ImportFormat, unit: LengthUnit): number {
  if (format === "glb" || format === "gltf") return MM_PER_UNIT.m // glTF 2.0: metres
  if (format === "step" || format === "iges") return 1 // occt converts to mm for us
  return MM_PER_UNIT[unit]
}

/** Above this many triangles in the whole scene, orbiting may drop below 60 fps (CLAUDE.md §6). */
export const TRIANGLE_BUDGET = 2_500_000
