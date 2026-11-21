import { num, pin, signal, type ModelDef } from "./define"

/** Motor drivers and switching transistors (PLAN 11.3). */
export const DRIVERS: ModelDef[] = [
  {
    id: "driver.hBridge",
    major: 1,
    name: "H-bridge",
    summary: "Drives a DC motor either way at a PWM duty (TB6612 / L298N class)",
    category: "drivers",
    symbol: "hBridge",
    ports: [
      pin("vm", "VM"),
      pin("gnd", "GND"),
      signal("in", "in1", "IN1", "data", "1", "pwm"),
      signal("in", "in2", "IN2", "data", "1", "pwm"),
      pin("out1", "OUT1", "right"),
      pin("out2", "OUT2", "right"),
    ],
    params: [
      num("rOn", "Switch resistance (each side)", "Ω", 0.5, { min: 0 }, true),
      num("maxCurrent", "Maximum current", "A", 1.2, { min: 0 }, true),
    ],
  },
  {
    id: "driver.stepper",
    major: 1,
    name: "Stepper driver",
    summary: "Step and direction to two coil currents (A4988 class)",
    category: "drivers",
    symbol: "stepperDriver",
    ports: [
      pin("vm", "VMOT"),
      pin("gnd", "GND"),
      signal("in", "step", "STEP", "data", "s", "pulse"),
      signal("in", "dir", "DIR", "data", "", "bool"),
      signal("in", "enable", "EN", "data", "", "bool"),
      pin("aPos", "1A", "right"),
      pin("aNeg", "1B", "right"),
      pin("bPos", "2A", "right"),
      pin("bNeg", "2B", "right"),
    ],
    params: [
      num("currentLimit", "Current limit", "A", 1, { min: 0 }, true),
      num("microsteps", "Microsteps", "1", 16, { min: 1, max: 256 }),
    ],
  },
  {
    id: "driver.mosfet",
    major: 1,
    name: "Transistor switch",
    summary: "A logic-level MOSFET or transistor used as a low-side switch",
    category: "drivers",
    symbol: "mosfet",
    ports: [pin("gate", "Gate"), pin("drain", "Drain", "right"), pin("source", "Source", "bottom")],
    params: [
      num("vth", "Threshold voltage", "V", 2, { min: 0 }, true),
      num("rOn", "On resistance", "Ω", 0.03, { min: 0 }, true),
    ],
  },
]
