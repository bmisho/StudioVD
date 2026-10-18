import type { Material } from "@/core/schema"

/** How well a number is supported (CLAUDE.md §12). */
export type Confidence = "high" | "medium" | "low"

/** The appearance part of a material: everything but identity, density and maps. */
export type Appearance = Omit<Material, "id" | "name" | "builtinKey" | "densityKgM3" | "maps">

export interface BuiltinMaterial {
  /** Stable key, stored as the material's `builtinKey`. */
  key: string
  name: string
  densityKgM3: number
  /** Where the density comes from and how sure it is. */
  density: { source: string; confidence: Confidence }
  look: Appearance
  /** What the appearance rests on. Roughness is an artistic default unless stated. */
  lookSource: string
}

/**
 * Neutral defaults: opaque, no transmission or clearcoat, IOR 1.5 (glTF's default, 4 %
 * reflectance) where no measured value is known.
 */
const look = (values: Partial<Appearance> & Pick<Appearance, "color">): Appearance => ({
  metalness: 0,
  roughness: 0.5,
  opacity: 1,
  transmission: 0,
  ior: 1.5,
  thicknessMm: 0,
  clearcoat: 0,
  clearcoatRoughness: 0,
  emissive: "#000000",
  emissiveIntensity: 0,
  ...values,
})

const PB = "physicallybased.info (CC0) measured colour"

/**
 * The built-in library (PLAN 6.2). Sources, ranges and the fact-check are in
 * `docs/research/materials.json`; plastic colours are typical natural colours (artistic).
 */
export const BUILTIN_MATERIALS: readonly BuiltinMaterial[] = [
  {
    key: "std.abs",
    name: "ABS",
    densityKgM3: 1040,
    density: { source: "BASF Terluran GP-35, ISO 1183", confidence: "high" },
    look: look({ color: "#e6dfca", roughness: 0.5 }),
    lookSource: "Artistic natural colour; IOR unknown (default)",
  },
  {
    key: "std.pla",
    name: "PLA",
    densityKgM3: 1240,
    density: { source: "Prusament and UltiMaker PLA datasheets, ISO 1183", confidence: "high" },
    look: look({ color: "#efede4", roughness: 0.4, ior: 1.46 }),
    lookSource: "IOR 1.46 (Bodurov fit at 589 nm); artistic natural colour",
  },
  {
    key: "std.pc-clear",
    name: "Polycarbonate (clear)",
    densityKgM3: 1200,
    density: { source: "Covestro Makrolon 2405, ISO 1183-1", confidence: "high" },
    look: look({ color: "#f7f7f7", roughness: 0.05, ior: 1.585, transmission: 1, thicknessMm: 3 }),
    lookSource: "IOR 1.585 (Covestro, ISO 489); tint derived to match 88 % at 3 mm",
  },
  {
    key: "std.pmma",
    name: "Acrylic (PMMA)",
    densityKgM3: 1190,
    density: { source: "PLEXIGLAS GS, ISO 1183; Plexiglas G, ASTM D792", confidence: "high" },
    look: look({ color: "#fafafa", roughness: 0.03, ior: 1.49, transmission: 1, thicknessMm: 3 }),
    lookSource: "IOR 1.49 (ASTM D542); tint derived to match 92 % at 3 mm",
  },
  {
    key: "std.pom",
    name: "Acetal (POM)",
    densityKgM3: 1410,
    density: { source: "Hostaform C9021, ISO 1183 (Delrin 100: 1.42)", confidence: "high" },
    look: look({ color: "#f2f1ec", roughness: 0.4 }),
    lookSource: "Artistic natural colour; IOR unknown (default)",
  },
  {
    key: "std.polyurethane",
    name: "Polyurethane",
    densityKgM3: 1200,
    density: {
      source: "Class default within 1120-1260 (Elastollan, Vulkollan)",
      confidence: "low",
    },
    look: look({ color: "#d4b483", roughness: 0.6, ior: 1.52 }),
    lookSource: "IOR: low end of aromatic PU 1.52-1.57 (Covestro); artistic colour",
  },
  {
    key: "std.glass-soda-lime",
    name: "Glass",
    densityKgM3: 2500,
    density: { source: "AGC Planibel, Pilkington, Guardian float glass", confidence: "high" },
    look: look({ color: "#fdfefe", roughness: 0, ior: 1.52, transmission: 1, thicknessMm: 4 }),
    lookSource: `${PB}; IOR 1.52 (Rubin)`,
  },
  {
    key: "std.aluminium-6061",
    name: "Aluminium 6061/6063",
    densityKgM3: 2700,
    density: { source: "Aluminum Association typical values (6061)", confidence: "high" },
    look: look({ color: "#f5f6f6", metalness: 1, roughness: 0.35 }),
    lookSource: `${PB} (Cheng n,k)`,
  },
  {
    key: "std.steel",
    name: "Steel",
    densityKgM3: 7850,
    density: { source: "EN 1991-1-1 Annex A; steel design guides", confidence: "high" },
    look: look({ color: "#c0bebb", metalness: 1, roughness: 0.4 }),
    lookSource: `${PB} (iron, Johnson and Christy)`,
  },
  {
    key: "std.stainless-304",
    name: "Stainless steel 304",
    densityKgM3: 8000,
    density: { source: "Grade 1.4301 suppliers 7.9-8.0 g/cm³", confidence: "medium" },
    look: look({ color: "#d6d1cb", metalness: 1, roughness: 0.3 }),
    lookSource: "Karlsson austenitic stainless n,k (refractiveindex.info)",
  },
  {
    key: "std.brass",
    name: "Brass",
    densityKgM3: 8500,
    density: { source: "C36000 free-cutting brass datasheets", confidence: "medium" },
    look: look({ color: "#f5e4ae", metalness: 1, roughness: 0.3 }),
    lookSource: "Querry Cu70Zn30 n,k (refractiveindex.info)",
  },
  {
    key: "std.copper",
    name: "Copper",
    densityKgM3: 8940,
    density: {
      source: "Copper at 20 °C: 8.92-8.94 g/cm³ (CDA, physicallybased)",
      confidence: "high",
    },
    look: look({ color: "#f7cfbf", metalness: 1, roughness: 0.3 }),
    lookSource: `${PB} (Johnson and Christy)`,
  },
  {
    key: "std.rubber",
    name: "Rubber",
    densityKgM3: 1100,
    density: { source: "Class default; filled EPDM/NBR compounds 1.12-1.28", confidence: "low" },
    look: look({ color: "#2a2a2a", roughness: 0.7, ior: 1.52 }),
    lookSource: `${PB} ("Tire"); IOR of natural rubber 1.519 (Sigma)`,
  },
  {
    key: "std.fr4",
    name: "FR-4",
    densityKgM3: 1850,
    density: { source: "FR-4 laminates 1.80-1.95 g/cm³ (ASTM D792)", confidence: "medium" },
    look: look({ color: "#2f6b3e", roughness: 0.35 }),
    lookSource: "Artistic solder-mask green; IOR unknown (default)",
  },
]
