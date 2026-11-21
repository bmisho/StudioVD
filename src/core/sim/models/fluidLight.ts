import { choice, num, signal, terminal, type ModelDef } from "./define"

const port = (key: string, name: string, side?: "left" | "right") =>
  terminal(key, name, "fluid", "Pa", side ? { side } : {})

/** Fluid and light models (PLAN 11.3). Fluid flow is mass flow (PLAN §3). */
export const FLUID_LIGHT: ModelDef[] = [
  {
    id: "fluid.pressureSource",
    major: 1,
    name: "Pressure source",
    summary: "A supply at a set gauge pressure (compressor, mains)",
    category: "fluid",
    symbol: "pressureSource",
    ports: [port("out", "Out", "right"), port("ref", "Return")],
    params: [
      num("pressure", "Gauge pressure", "Pa", 600000, { min: 0, max: 1e8 }),
      choice("medium", "Medium", ["air", "water", "oil"], "air"),
    ],
  },
  {
    id: "fluid.restriction",
    major: 1,
    name: "Restriction",
    summary: "Flow through an orifice or a length of tube",
    category: "fluid",
    symbol: "restriction",
    ports: [port("a", "A"), port("b", "B", "right")],
    params: [
      num("conductance", "Sonic conductance (ISO 6358)", "m³/(s·Pa)", 1e-9, { min: 0 }, true),
    ],
  },
  {
    id: "fluid.valve",
    major: 1,
    name: "Valve",
    summary: "Open or closed, by hand or by a signal",
    category: "fluid",
    symbol: "valve",
    ports: [
      port("a", "A"),
      port("b", "B", "right"),
      signal("in", "open", "Open", "data", "", "bool"),
    ],
    params: [num("conductance", "Conductance when open", "m³/(s·Pa)", 1e-9, { min: 0 }, true)],
  },
  {
    id: "fluid.checkValve",
    major: 1,
    name: "Check valve",
    summary: "Flow one way above its cracking pressure",
    category: "fluid",
    symbol: "checkValve",
    ports: [port("inlet", "In"), port("outlet", "Out", "right")],
    params: [num("cracking", "Cracking pressure", "Pa", 10000, { min: 0 }, true)],
  },
  {
    id: "fluid.cylinder",
    major: 1,
    name: "Cylinder",
    summary: "F = p·A on the rod (double acting)",
    category: "fluid",
    symbol: "cylinder",
    ports: [
      port("portA", "Port A (cap end)"),
      port("portB", "Port B (rod end)"),
      terminal("rod", "Rod", "mechTranslational", "m/s", { reference: "body", side: "right" }),
      terminal("body", "Body", "mechTranslational", "m/s", { side: "right" }),
    ],
    params: [
      num("bore", "Bore", "m", 0.016, { min: 1e-4, max: 1 }),
      num("rod", "Rod diameter", "m", 0.006, { min: 0, max: 1 }),
      num("stroke", "Stroke", "m", 0.05, { min: 0, max: 10 }),
    ],
  },
  {
    id: "light.emitter",
    major: 1,
    name: "Light emitter",
    summary: "A lamp or laser module with a beam angle",
    category: "light",
    symbol: "emitter",
    ports: [
      signal("in", "level", "Level", "data", "1", "pwm"),
      signal("out", "light", "Light", "light", "cd"),
    ],
    params: [
      num("intensity", "On-axis intensity", "cd", 1, { min: 0 }, true),
      num("halfAngle", "Beam half-angle", "rad", 0.26, { min: 0, max: Math.PI }, true),
    ],
  },
  {
    id: "light.sensor",
    major: 1,
    name: "Light sensor",
    summary: "Illuminance at its anchor, as a reading",
    category: "light",
    symbol: "lightSensor",
    ports: [
      signal("in", "light", "Light", "light", "lx"),
      signal("out", "reading", "Reading", "data", "lx", "number"),
    ],
    params: [],
  },
  {
    id: "light.attenuator",
    major: 1,
    name: "Lens / filter",
    summary: "Passes a share of the light (a lens, mirror or filter)",
    category: "light",
    symbol: "attenuator",
    ports: [signal("in", "in", "In", "light", "cd"), signal("out", "out", "Out", "light", "cd")],
    params: [num("transmission", "Transmission", "1", 0.9, { min: 0, max: 1 }, true)],
  },
]
