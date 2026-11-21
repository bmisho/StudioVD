import { conductance, sigmoid, sigmoidSlope, twoTerminal } from "../stampKit"
import { num, type Behaviour, type Var } from "../types"
import { hold, holdCheck, holdSettle } from "./hold"

// Motors and actuators (PLAN 11.3, 12.7). Shafts are rotational ports against their frame.

const P = (port: string): Var => ({ port })
const B = (branch: number): Var => ({ branch })

/**
 * DC motor: V = R·I + ke·ω, τ = kt·I. Its branch is the winding current (+ → −); the torque
 * goes into the shaft and back out of the frame.
 */
const dcMotor: Behaviour = {
  branches: () => 1,
  stamp: (s, c) => {
    const [kt, ke, r] = [num(c, "kt"), num(c, "ke"), num(c, "resistance")]
    const i = s.x(0)
    s.flow("pos", i, [[B(0), 1]])
    s.flow("neg", -i, [[B(0), -1]])
    s.flow("shaft", -kt * i, [[B(0), -kt]])
    s.flow("frame", kt * i, [[B(0), kt]])
    const w = s.e("shaft") - s.e("frame")
    s.equation(0, s.e("pos") - s.e("neg") - r * i - ke * w, [
      [P("pos"), 1],
      [P("neg"), -1],
      [B(0), -r],
      [P("shaft"), -ke],
      [P("frame"), ke],
    ])
  },
  check: (c, r) => {
    const w = Math.abs(r.e("shaft") - r.e("frame"))
    const i = Math.abs(r.x(0))
    return i > 1e-9 && w < 1e-6
      ? [
          {
            code: "stalled",
            severity: "info",
            message: `${c.label} is stalled: it draws ${i.toPrecision(3)} A.`,
          },
        ]
      : []
  },
}

/** Powered above about 1 V: below that a servo neither holds nor draws its idle current. */
const powered = (v: number) => sigmoid(v, 1, 0.2)

/** Servo: holds its angle up to its stall torque, drawing more current the harder it holds. */
const servo: Behaviour = {
  branches: () => 1,
  stamp: (s, c) => {
    const v = s.e("pos") - s.e("neg")
    hold(s, c, num(c, "stallTorque"), v > 3)
    // Current: idle plus a share of stall current in proportion to the torque held.
    const tau = s.x(0)
    const soft = Math.sqrt(tau * tau + 1e-12)
    const k = num(c, "stallCurrent") / Math.max(num(c, "stallTorque"), 1e-9)
    const i0 = num(c, "idleCurrent") + k * soft
    const [on, dOn] = [powered(v), sigmoidSlope(v, 1, 0.2)]
    const i = i0 * on
    const dv = i0 * dOn
    const dt = k * (tau / soft) * on
    s.flow("pos", i, [
      [P("pos"), dv],
      [P("neg"), -dv],
      [B(0), dt],
    ])
    s.flow("neg", -i, [
      [P("pos"), -dv],
      [P("neg"), dv],
      [B(0), -dt],
    ])
  },
  settle: (c, r) => holdSettle(c, r, num(c, "stallTorque"), r.e("pos") - r.e("neg") > 3),
  check: (c) => holdCheck(c),
}

/** Stepper: coils are resistors; the shaft holds up to the holding torque the current gives. */
const stepper: Behaviour = {
  branches: () => 1,
  stamp: (s, c) => {
    const r = Math.max(num(c, "phaseResistance"), 1e-3)
    conductance(s, "aPos", "aNeg", 1 / r)
    conductance(s, "bPos", "bNeg", 1 / r)
    const available = Number(c.state.available ?? 0)
    hold(s, c, available, available > 0)
  },
  settle: (c, r) => {
    const rp = Math.max(num(c, "phaseResistance"), 1e-3)
    const amps =
      Math.max(Math.abs(r.e("aPos") - r.e("aNeg")), Math.abs(r.e("bPos") - r.e("bNeg"))) / rp
    const share = Math.min(1, amps / Math.max(num(c, "ratedCurrent"), 1e-9))
    // Torque grows with current; a tenth of the rated current is too little to hold.
    const available = share >= 0.1 ? num(c, "holdingTorque") * share : 0
    const was = Number(c.state.available ?? 0)
    c.state.available = available
    const changed = Math.abs(available - was) > 1e-9 * Math.max(1, available)
    return holdSettle(c, r, available, available > 0) || changed
  },
  check: (c) => holdCheck(c),
}

/** Solenoid: the coil pulls its plunger with F = F_rated·(V/V_rated)². */
const solenoid: Behaviour = {
  stamp: (s, c) => {
    conductance(s, "pos", "neg", 1 / Math.max(num(c, "coilResistance"), 1e-3))
    const v = s.e("pos") - s.e("neg")
    const vr = Math.max(num(c, "ratedVoltage"), 1e-9)
    const k = num(c, "force") / (vr * vr)
    const f = k * v * v
    const df = 2 * k * v
    s.flow("body", f, [
      [P("pos"), df],
      [P("neg"), -df],
    ])
    s.flow("plunger", -f, [
      [P("pos"), -df],
      [P("neg"), df],
    ])
  },
}

/**
 * Pump or fan: speed s = V/V_rated; flow ṁ = s·ṁmax − ṁmax·Δp/(pmax·s) (a straight curve
 * that scales by the affinity laws), current I = I_rated·s².
 */
const turbo: Behaviour = {
  stamp: (s, c) => {
    const vr = Math.max(num(c, "ratedVoltage"), 1e-9)
    const v = s.e("pos") - s.e("neg")
    const sp = Math.max(0, v) / vr
    const [mMax, pMax] = [num(c, "maxFlow"), Math.max(num(c, "maxPressure"), 1e-9)]
    const sEff = Math.max(sp, 0.05)
    const dp = s.e("outlet") - s.e("inlet")
    const m = sp * mMax - (mMax * dp) / (pMax * sEff)
    const dmdp = mMax / (pMax * sEff)
    const dmdv = v > 0 ? (mMax + (sp > 0.05 ? (mMax * dp) / (pMax * sp * sp) : 0)) / vr : 0
    s.flow("inlet", m, [
      [P("outlet"), -dmdp],
      [P("inlet"), dmdp],
      [P("pos"), dmdv],
      [P("neg"), -dmdv],
    ])
    s.flow("outlet", -m, [
      [P("outlet"), dmdp],
      [P("inlet"), -dmdp],
      [P("pos"), -dmdv],
      [P("neg"), dmdv],
    ])
    const ir = num(c, "ratedCurrent")
    const i = ir * sp * sp
    const g = v > 0 ? (2 * ir * sp) / vr : 0
    twoTerminal(s, "pos", "neg", i, g)
  },
}

export const ELECTROMECH_BEHAVIOURS: Readonly<Record<string, Behaviour>> = {
  "electromech.dcMotor": dcMotor,
  "electromech.servo": servo,
  "electromech.stepper": stepper,
  "electromech.solenoid": solenoid,
  "electromech.pump": turbo,
  "electromech.fan": turbo,
}
