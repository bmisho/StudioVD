import { anchor, bind, block, box, mate } from "./exampleKit"

/**
 * A light path blocked by a dragged part (PLAN 13.5): a lamp shines across the base onto a
 * sensor (E = I·cos θ/d²); slide the shutter into the beam (test mode) and the reading drops
 * to nothing. The sensor's reading is shown at the sensor.
 */
export async function lightPath(): Promise<void> {
  const base = await box("Base", [200, 10, 160], [0, 0, 0], true)
  const lampPost = await box("Lamp", [10, 40, 10], [-80, 25, 0], true)
  const sensorPost = await box("Sensor", [10, 40, 10], [80, 25, 0], true)
  const shutter = await box("Shutter", [10, 40, 40], [0, 25, 60])
  const emitter = anchor(lampPost, "Lens", [5, 10, 0], [1, 0, 0], [0, 1, 0])
  const sensor = anchor(sensorPost, "Window", [-5, 10, 0], [-1, 0, 0], [0, 1, 0])
  const rail = anchor(base, "Shutter rail", [0, 5, 60], [0, 0, 1], [1, 0, 0])
  const slide = anchor(shutter, "Rail", [0, -20, 0], [0, 0, 1], [1, 0, 0])
  // Coordinate 0 is clear of the beam; sliding toward −z by up to 80 mm closes it.
  mate("prismatic", rail, slide, { min: -80, max: 0 })

  const lamp = block("light.emitter@1", 0, 0, { intensity: 50 })
  const reader = block("light.sensor@1", 288, 0)
  bind({
    from: { kind: "light", node: lamp, port: "light", emitter, sensor, halfAngle: 0.3 },
    to: { kind: "input", node: reader, port: "light" },
    scale: 1,
    offset: 0,
  })
  bind({
    from: { kind: "output", node: reader, port: "reading", quantity: "value" },
    to: { kind: "label", anchor: sensor, unit: "lx" },
    scale: 1,
    offset: 0,
  })
}
