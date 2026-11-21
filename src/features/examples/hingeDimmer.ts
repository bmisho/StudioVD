import { anchor, bind, block, box, mate, wire } from "./exampleKit"

/**
 * Hinge dims an LED (PLAN 13.5): opening a lid turns a potentiometer that feeds an LED;
 * the LED on the base glows with its light. Opening is a negative angle about the hinge
 * (the lid lifts away from the base), so the binding maps −90°…0 onto the wiper's 1…0.
 */
export async function hingeDimmer(): Promise<void> {
  const base = await box("Base", [120, 10, 80], [0, 0, 0], true)
  const lid = await box("Lid", [120, 6, 80], [0, 40, 0])
  const lamp = await box("LED", [8, 8, 8], [45, 0, 44], true) // on the base's front face
  const onBase = anchor(base, "Hinge", [0, 5, -40], [1, 0, 0], [0, 1, 0])
  const onLid = anchor(lid, "Hinge", [0, -3, -40], [1, 0, 0], [0, 1, 0])
  const hinge = mate("revolute", onBase, onLid, { min: -Math.PI / 2, max: 0 })

  const bat = block("electrical.battery@1", 0, 0, { emf: 5, rInternal: 0.5 })
  const gnd = block("electrical.ground@1", 0, 192)
  const pot = block("electrical.potentiometer@1", 224, 0, { resistance: 10_000 })
  const res = block("electrical.resistor@1", 448, 0, { resistance: 150 })
  const led = block("electrical.led@1", 672, 0)
  wire(bat, "neg", gnd, "gnd")
  wire(bat, "pos", pot, "b")
  wire(pot, "a", gnd, "gnd")
  wire(pot, "wiper", res, "a")
  wire(res, "b", led, "anode")
  wire(led, "cathode", gnd, "gnd")
  bind({
    from: { kind: "mateCoordinate", mate: hinge },
    to: { kind: "param", node: pot, param: "position" },
    scale: -2 / Math.PI,
    offset: 0,
    min: 0,
    max: 1,
  })
  bind({
    from: { kind: "output", node: led, port: "light", quantity: "value" },
    to: { kind: "glow", part: lamp, color: "red" },
    scale: 10, // 0.1 cd, the LED's rated intensity, is full glow
    offset: 0,
  })
}
