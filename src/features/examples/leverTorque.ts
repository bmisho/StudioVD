import { anchor, bind, block, box, mate, wire } from "./exampleKit"

/**
 * A lever's holding torque sets a servo's current (PLAN 13.5): gravity on a horizontal arm
 * loads the servo that holds it; the current it draws is shown at the hinge. Raise the arm
 * (test mode) and the torque, and the current, fall.
 */
export async function leverTorque(): Promise<void> {
  const post = await box("Post", [20, 60, 20], [0, 30, 0], true)
  const arm = await box("Arm", [10, 5, 150], [0, 70, 80])
  const onPost = anchor(post, "Servo axis", [0, 30, 0], [1, 0, 0], [0, 1, 0])
  const onArm = anchor(arm, "Pivot", [0, -2.5, -75], [1, 0, 0], [0, 1, 0])
  const hinge = mate("revolute", onPost, onArm, { min: -Math.PI / 2, max: Math.PI / 2 })

  const bat = block("electrical.battery@1", 0, 0, { emf: 5, rInternal: 0.1 })
  const gnd = block("electrical.ground@1", 0, 192)
  const servo = block("electromech.servo@1", 224, 0)
  const frame = block("mechanical.groundRotational@1", 224, 256)
  const load = block("mechanical.load@1", 448, 0)
  wire(bat, "neg", gnd, "gnd")
  wire(bat, "pos", servo, "pos")
  wire(servo, "neg", gnd, "gnd")
  wire(servo, "frame", frame, "frame")
  wire(load, "frame", frame, "frame")
  wire(servo, "shaft", load, "axis")
  bind({
    from: { kind: "gravityLoad", mate: hinge },
    to: { kind: "param", node: load, param: "torque" },
    scale: 1,
    offset: 0,
  })
  bind({
    from: { kind: "output", node: servo, port: "pos", quantity: "flow" },
    to: { kind: "label", anchor: onPost, unit: "A" },
    scale: 1,
    offset: 0,
  })
}
