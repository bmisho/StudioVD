import { num, terminal, type ModelDef } from "./define"

const rot = (key: string, name: string, side?: "left" | "right" | "bottom") =>
  terminal(key, name, "mechRotational", "rad/s", side ? { side } : {})
const lin = (key: string, name: string, side?: "left" | "right" | "bottom") =>
  terminal(key, name, "mechTranslational", "m/s", side ? { side } : {})

/** Mechanical models (PLAN 11.3): grounds, transmissions, springs, friction, loads. */
export const MECHANICAL: ModelDef[] = [
  {
    id: "mechanical.groundRotational",
    major: 1,
    name: "Rotational ground",
    summary: "A frame that cannot turn",
    category: "mechanical",
    symbol: "mechGround",
    ports: [rot("frame", "Frame")],
    params: [],
  },
  {
    id: "mechanical.groundTranslational",
    major: 1,
    name: "Translational ground",
    summary: "A frame that cannot move",
    category: "mechanical",
    symbol: "mechGround",
    ports: [lin("frame", "Frame")],
    params: [],
  },
  {
    id: "mechanical.gear",
    major: 1,
    name: "Gear ratio",
    summary: "ω out = ω in ÷ ratio, τ out = τ in × ratio × efficiency",
    category: "mechanical",
    symbol: "gear",
    ports: [
      { ...rot("input", "Input"), reference: "frame" },
      { ...rot("output", "Output", "right"), reference: "frame" },
      rot("frame", "Frame", "bottom"),
    ],
    params: [
      num("ratio", "Ratio", "1", 2, { min: -1e4, max: 1e4 }),
      num("efficiency", "Efficiency", "1", 1, { min: 0, max: 1 }),
    ],
  },
  {
    id: "mechanical.leadScrew",
    major: 1,
    name: "Lead screw",
    summary: "v = lead × ω ÷ 2π",
    category: "mechanical",
    symbol: "leadScrew",
    ports: [
      { ...rot("screw", "Screw"), reference: "frame" },
      { ...lin("nut", "Nut", "right"), reference: "body" },
      rot("frame", "Frame", "bottom"),
      lin("body", "Body", "bottom"),
    ],
    params: [
      num("lead", "Lead", "m", 0.008, { min: 1e-6, max: 1 }),
      num("efficiency", "Efficiency", "1", 0.4, { min: 0, max: 1 }, true),
    ],
  },
  {
    id: "mechanical.spring",
    major: 1,
    name: "Spring",
    summary: "F = k·x, with a preload",
    category: "mechanical",
    symbol: "spring",
    ports: [lin("a", "A"), lin("b", "B", "right")],
    params: [
      num("stiffness", "Rate", "N/m", 1000, { min: 0 }),
      num("preload", "Preload", "N", 0, { min: -1e6, max: 1e6 }),
    ],
  },
  {
    id: "mechanical.friction",
    major: 1,
    name: "Damper / friction",
    summary: "Viscous damping plus Coulomb friction",
    category: "mechanical",
    symbol: "damper",
    ports: [lin("a", "A"), lin("b", "B", "right")],
    params: [
      num("damping", "Damping", "N·s/m", 1, { min: 0 }),
      num("coulomb", "Friction force", "N", 0, { min: 0 }),
    ],
  },
  {
    id: "mechanical.load",
    major: 1,
    name: "Load",
    summary: "A torque or force on an axis; gravity from the 3D parts (Phase 13)",
    category: "mechanical",
    symbol: "load",
    ports: [{ ...rot("axis", "Axis"), reference: "frame" }, rot("frame", "Frame", "bottom")],
    params: [num("torque", "Torque", "N·m", 0, { min: -1e6, max: 1e6 })],
  },
]
