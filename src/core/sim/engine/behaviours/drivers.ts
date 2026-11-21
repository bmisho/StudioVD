import { sigmoid, sigmoidSlope, transformer } from "../stampKit"
import {
  asBool,
  asNumber,
  num,
  type Behaviour,
  type Instance,
  type Reader,
  type Var,
} from "../types"

// Motor drivers and switching transistors (PLAN 11.3) as averaged switches: a PWM half-bridge
// at duty d is a transformer of ratio d from its supply, behind its switch resistance.

const P = (port: string): Var => ({ port })
const duty = (r: Reader, port: string) => Math.min(1, Math.max(0, asNumber(r.input(port))))

/** H-bridge: OUTx − GND = dutyx·(VM − GND) − rOn·I, each output a half-bridge. */
const hBridge: Behaviour = {
  branches: () => 2,
  stamp: (s, c, r) => {
    const rOn = num(c, "rOn")
    transformer(s, ["out1", "gnd"], ["vm", "gnd"], duty(r, "in1"), 0, rOn)
    transformer(s, ["out2", "gnd"], ["vm", "gnd"], duty(r, "in2"), 1, rOn)
  },
  check: (c, r) => {
    const i = Math.max(Math.abs(r.x(0)), Math.abs(r.x(1)))
    const max = num(c, "maxCurrent")
    return i > max
      ? [
          {
            code: "rating",
            severity: "warning",
            message: `${c.label}: output current ${i.toPrecision(3)} A is over its ${max} A rating.`,
          },
        ]
      : []
  },
}

/** A stepper driver needs about 8 V on VMOT (A4988 class) to regulate its coil current. */
const VMOT_MIN = 8
const enabled = (r: Reader) => {
  const v = r.input("enable")
  return v === undefined || asBool(v)
}

/**
 * Stepper driver, held at one step: both coil currents at the current limit (chopper
 * regulated), the power they take drawn from VMOT (90 % efficient, estimated).
 */
const stepperDriver: Behaviour = {
  stamp: (s, c, r) => {
    if (!enabled(r)) return
    const vm = s.e("vm") - s.e("gnd")
    const on = sigmoid(vm, VMOT_MIN, 0.3)
    const dOn = sigmoidSlope(vm, VMOT_MIN, 0.3)
    const limit = num(c, "currentLimit")
    const i = limit * on
    for (const [pos, neg] of [
      ["aPos", "aNeg"],
      ["bPos", "bNeg"],
    ] as const) {
      // Out of the driver into pos, back in at neg.
      s.flow(pos, -i, [
        [P("vm"), -limit * dOn],
        [P("gnd"), limit * dOn],
      ])
      s.flow(neg, i, [
        [P("vm"), limit * dOn],
        [P("gnd"), -limit * dOn],
      ])
    }
    // Supply current: the coils' power over the supply voltage.
    const va = s.e("aPos") - s.e("aNeg")
    const vb = s.e("bPos") - s.e("bNeg")
    const vmSafe = Math.max(vm, 1)
    const iv = (i * (va + vb)) / (vmSafe * 0.9)
    const k = i / (vmSafe * 0.9)
    const dvm = vm > 1 ? -iv / vmSafe : 0
    const d: [Var, number][] = [
      [P("aPos"), k],
      [P("aNeg"), -k],
      [P("bPos"), k],
      [P("bNeg"), -k],
      [P("vm"), dvm],
      [P("gnd"), -dvm],
    ]
    s.flow("vm", iv, d)
    s.flow(
      "gnd",
      -iv,
      d.map(([v, x]) => [v, -x] as [Var, number])
    )
  },
}

/** MOSFET as a switch: on resistance above the threshold, smoothly off below. */
const mosfet: Behaviour = {
  stamp: (s, c: Instance) => {
    const gOn = 1 / Math.max(num(c, "rOn"), 1e-6)
    const vgs = s.e("gate") - s.e("source")
    const vds = s.e("drain") - s.e("source")
    const g = gOn * sigmoid(vgs, num(c, "vth"), 0.1)
    const dg = gOn * sigmoidSlope(vgs, num(c, "vth"), 0.1)
    const i = g * vds
    const d: [Var, number][] = [
      [P("drain"), g],
      [P("gate"), dg * vds],
      [P("source"), -g - dg * vds],
    ]
    s.flow("drain", i, d)
    s.flow(
      "source",
      -i,
      d.map(([v, x]) => [v, -x] as [Var, number])
    )
  },
}

export const DRIVER_BEHAVIOURS: Readonly<Record<string, Behaviour>> = {
  "driver.hBridge": hBridge,
  "driver.stepper": stepperDriver,
  "driver.mosfet": mosfet,
}
