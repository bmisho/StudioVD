import { num, pin, signal, terminal, type ModelDef } from "./define"

const shaft = terminal("shaft", "Shaft", "mechRotational", "rad/s", {
  reference: "frame",
  side: "right",
})
const frame = terminal("frame", "Frame", "mechRotational", "rad/s", { side: "bottom" })
const power = [pin("pos", "+"), pin("neg", "−")]

/** Electromechanical models (PLAN 11.3): motors, actuators, pumps and fans. */
export const ELECTROMECHANICAL: ModelDef[] = [
  {
    id: "electromech.dcMotor",
    major: 1,
    name: "DC motor",
    summary: "τ = kt·I, back EMF = ke·ω, winding resistance",
    category: "electromechanical",
    symbol: "motor",
    ports: [...power, shaft, frame],
    params: [
      num("kt", "Torque constant", "N·m/A", 0.01, { min: 0 }, true),
      num("ke", "Back-EMF constant", "V·s/rad", 0.01, { min: 0 }, true),
      num("resistance", "Winding resistance", "Ω", 2, { min: 1e-3 }, true),
      num("ratedVoltage", "Rated voltage", "V", 6, { min: 0 }, true),
    ],
  },
  {
    id: "electromech.servo",
    major: 1,
    name: "Servo",
    summary: "Holds the commanded angle up to its stall torque",
    category: "electromechanical",
    symbol: "servo",
    ports: [...power, signal("in", "command", "Pulse", "data", "s", "pulse"), shaft, frame],
    params: [
      num("stallTorque", "Stall torque", "N·m", 0.18, { min: 0 }, true),
      num("range", "Travel", "rad", Math.PI, { min: 0, max: 2 * Math.PI }, true),
      num("pulseMin", "Pulse at one end", "s", 0.0005, { min: 0 }, true),
      num("pulseMax", "Pulse at the other", "s", 0.0025, { min: 0 }, true),
      num("idleCurrent", "Idle current", "A", 0.01, { min: 0 }, true),
    ],
  },
  {
    id: "electromech.stepper",
    major: 1,
    name: "Stepper motor",
    summary: "Two-phase: holds its step up to the holding torque",
    category: "electromechanical",
    symbol: "stepper",
    ports: [
      pin("aPos", "A+"),
      pin("aNeg", "A−"),
      pin("bPos", "B+"),
      pin("bNeg", "B−"),
      shaft,
      frame,
    ],
    params: [
      num("stepAngle", "Step angle", "rad", (1.8 * Math.PI) / 180, { min: 0 }, true),
      num("holdingTorque", "Holding torque", "N·m", 0.4, { min: 0 }, true),
      num("phaseResistance", "Phase resistance", "Ω", 1.5, { min: 1e-3 }, true),
      num("ratedCurrent", "Rated current", "A", 1.5, { min: 0 }, true),
    ],
  },
  {
    id: "electromech.solenoid",
    major: 1,
    name: "Solenoid",
    summary: "A plunger pulled with a force while its coil is powered",
    category: "electromechanical",
    symbol: "solenoid",
    ports: [
      ...power,
      terminal("plunger", "Plunger", "mechTranslational", "m/s", {
        reference: "body",
        side: "right",
      }),
      terminal("body", "Body", "mechTranslational", "m/s", { side: "bottom" }),
    ],
    params: [
      num("force", "Force at rated voltage", "N", 5, { min: 0 }, true),
      num("stroke", "Stroke", "m", 0.01, { min: 0 }, true),
      num("coilResistance", "Coil resistance", "Ω", 20, { min: 1e-3 }, true),
      num("ratedVoltage", "Rated voltage", "V", 12, { min: 0 }, true),
    ],
  },
  {
    id: "electromech.pump",
    major: 1,
    name: "Pump",
    summary: "Mass flow against pressure, from its pump curve",
    category: "electromechanical",
    symbol: "pump",
    ports: [
      ...power,
      terminal("inlet", "Inlet", "fluid", "Pa", { medium: "water" }),
      terminal("outlet", "Outlet", "fluid", "Pa", { medium: "water", side: "right" }),
    ],
    params: [
      num("maxFlow", "Flow at zero head", "kg/s", 0.03, { min: 0 }, true),
      num("maxPressure", "Pressure at zero flow", "Pa", 30000, { min: 0 }, true),
      num("ratedVoltage", "Rated voltage", "V", 12, { min: 0 }, true),
      num("ratedCurrent", "Rated current", "A", 0.5, { min: 0 }, true),
    ],
  },
  {
    id: "electromech.fan",
    major: 1,
    name: "Fan",
    summary: "Moves air: flow against pressure, from its fan curve",
    category: "electromechanical",
    symbol: "fan",
    ports: [
      ...power,
      terminal("inlet", "Inlet", "fluid", "Pa", { medium: "air" }),
      terminal("outlet", "Outlet", "fluid", "Pa", { medium: "air", side: "right" }),
    ],
    params: [
      num("maxFlow", "Flow at zero pressure", "kg/s", 0.006, { min: 0 }, true),
      num("maxPressure", "Pressure at zero flow", "Pa", 30, { min: 0 }, true),
      num("ratedVoltage", "Rated voltage", "V", 12, { min: 0 }, true),
      num("ratedCurrent", "Rated current", "A", 0.1, { min: 0 }, true),
    ],
  },
]
