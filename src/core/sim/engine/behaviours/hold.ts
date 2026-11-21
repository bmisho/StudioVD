import type { Instance, Reader, Stamper } from "../types"

// Position-holding actuators (PLAN 12.7): a servo or stepper holds its shaft still against
// its frame while the torque needed is within what it has; beyond that it is back-driven and
// gives only that much (state `stalled`, with the direction it was turned).
//
// Branch 0 is the torque the actuator takes from the shaft (shaft → frame).

export function hold(s: Stamper, c: Instance, limit: number, able: boolean): void {
  const tau = s.x(0)
  s.flow("shaft", tau, [[{ branch: 0 }, 1]])
  s.flow("frame", -tau, [[{ branch: 0 }, -1]])
  if (!able) {
    s.equation(0, tau, [[{ branch: 0 }, 1]]) // unpowered: the shaft turns freely
    return
  }
  if (c.state.stalled === true) {
    const dir = Number(c.state.direction ?? 1)
    s.equation(0, tau - dir * limit, [[{ branch: 0 }, 1]])
    return
  }
  s.equation(0, s.e("shaft") - s.e("frame"), [
    [{ port: "shaft" }, 1],
    [{ port: "frame" }, -1],
  ])
}

/** Stalls when the hold needs more than `limit`; recovers once the load stops driving it. */
export function holdSettle(c: Instance, r: Reader, limit: number, able: boolean): boolean {
  const stalled = c.state.stalled === true
  if (!able) {
    c.state.stalled = false
    return stalled
  }
  if (!stalled) {
    const tau = r.x(0)
    if (Math.abs(tau) <= limit * (1 + 1e-9)) return false
    c.state.stalled = true
    c.state.direction = Math.sign(tau)
    return true
  }
  // Stalled: the load turns the shaft against the actuator's torque. Once it no longer does
  // (the shaft would turn the actuator's way), holding is possible again.
  const w = r.e("shaft") - r.e("frame")
  const dir = Number(c.state.direction ?? 1)
  if (w * dir > 0) return false
  c.state.stalled = false
  return true
}

export function holdCheck(c: Instance) {
  return c.state.stalled === true
    ? [
        {
          code: "back-driven",
          severity: "warning" as const,
          message: `${c.label} is stalled and back-driven: the load needs more torque than it has.`,
        },
      ]
    : []
}
