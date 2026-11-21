import { anchor, bind, block, box, mate, wire } from "./exampleKit"

/**
 * A limit switch cuts a motor (PLAN 13.5): while the flap rests on the base the switch is
 * open and the motor stands still; lift the flap (test mode, drag it) and the motor runs,
 * its housing glowing with its speed.
 */
export async function limitSwitch(): Promise<void> {
  const base = await box("Base", [120, 10, 80], [0, 0, 0], true)
  const flap = await box("Flap", [60, 4, 40], [0, 30, 0])
  const motorBox = await box("Motor", [30, 30, 40], [-80, 10, 0], true)
  const onBase = anchor(base, "Flap hinge", [0, 5, -20], [1, 0, 0], [0, 1, 0])
  const onFlap = anchor(flap, "Hinge", [0, -2, -20], [1, 0, 0], [0, 1, 0])
  mate("revolute", onBase, onFlap, { min: -Math.PI / 2, max: 0 })

  const bat = block("electrical.battery@1", 0, 0, { emf: 12, rInternal: 0.2 })
  const gnd = block("electrical.ground@1", 0, 192)
  const sw = block("electrical.switch@1", 224, 0)
  const motor = block("electromech.dcMotor@1", 448, 0)
  const frame = block("mechanical.groundRotational@1", 448, 224)
  wire(bat, "neg", gnd, "gnd")
  wire(bat, "pos", sw, "a")
  wire(sw, "b", motor, "pos")
  wire(motor, "neg", gnd, "gnd")
  wire(motor, "frame", frame, "frame")
  // Touching opens the switch: closed = 1 − contact.
  bind({
    from: { kind: "contact", a: base, b: flap },
    to: { kind: "param", node: sw, param: "closed" },
    scale: -1,
    offset: 1,
  })
  // A free 12 V motor with ke = 0.01 V·s/rad spins near 1200 rad/s: that is full glow.
  bind({
    from: { kind: "output", node: motor, port: "shaft", quantity: "effort" },
    to: { kind: "glow", part: motorBox, color: "amber" },
    scale: 1 / 1200,
    offset: 0,
  })
}
