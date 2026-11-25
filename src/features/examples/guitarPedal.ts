import { applyPoint, fromPose, invert } from "@/core/math/rigid"
import { rotate } from "@/core/math/vec3"
import type { AnchorId, PartId, Vec3 } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { at, generated, mateFlipped, type Placed } from "./componentKit"
import { anchor } from "./exampleKit"
import { pedalCircuit } from "./pedalCircuit"
import { wirePedal, type PedalParts } from "./pedalWiring"

// The box upside down, as a pedal stands: its floor is the top panel (knobs above it), its
// lid the base plate on the ground. Positions below are in the world (mm, Y up, the viewer
// at +Z, the knobs at the back).
const BOX = { w: 120, d: 94, h: 38, wall: 2.5 } as const
const TOP = BOX.h + 2 // the lid adds 2 mm (the enclosure generator's lid thickness)
const PANEL = TOP - BOX.wall // the top panel's inner face
const BASE = 2 // the lid's inner face
const [SIDE, FRONT] = [BOX.w / 2 - BOX.wall, BOX.d / 2 - BOX.wall] // the walls' inner faces
const UPSIDE_DOWN = [1, 0, 0, 0] as const
const LYING_FLAT = [-0.5, -0.5, -0.5, 0.5] as const // the battery's height along +X, thickness up
// Zip tie mounts on the front wall: the base against the wall, the cables along X.
const ON_FRONT_WALL = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] as const
const DOWN: Vec3 = [0, -1, 0]

/**
 * A hole on the box at a world point, facing `into` the box, its x across the panel (all in
 * the world; a part's x lines up with it). Anchors are in the part's own frame (its mesh
 * centred), so the world goes through the box's pose.
 */
function hole(box: PartId, name: string, p: Vec3, into: Vec3, x: Vec3 = [0, 1, 0]): AnchorId {
  const parts = useDocumentStore.getState().doc.parts
  const part = Object.hasOwn(parts, box) ? parts[box] : undefined
  if (!part) throw new Error("No box.")
  const toPart = invert(fromPose(part.pose))
  return anchor(box, name, applyPoint(toPart, p), rotate(toPart.q, into), rotate(toPart.q, x))
}

/** A panel part: inserted, then fixed behind its hole by `by` (it snaps into place). */
async function panelPart(
  id: string,
  changes: Record<string, number | string>,
  through: AnchorId,
  by = "bushing"
) {
  const p = await generated(id, changes, [0, 0, 0])
  mateFlipped("fixed", through, at(p, by))
  return p
}

const partOf = (p: Placed, key: string): PartId => {
  const id = Object.hasOwn(p.parts, key) ? p.parts[key] : undefined
  if (!id) throw new Error(`No part ${key}.`)
  return id
}

/**
 * Help › Examples › Guitar pedal (PLAN 16.6): a see-through box with three pots and knobs,
 * input, output and DC jacks, a 3PDT footswitch, an LED, a 9 V battery and a board, wired
 * with cables cut to length through zip ties on mounts. In test mode each knob dims the LED
 * and stamping on the footswitch turns it on and off (0.2.2).
 */
export async function guitarPedal(): Promise<void> {
  const store = useDocumentStore.getState
  const enclosure = await generated(
    "enclosure.box",
    {
      widthMm: BOX.w,
      depthMm: BOX.d,
      heightMm: BOX.h,
      wallMm: BOX.wall,
      floorMm: BOX.wall,
      cornerRadiusMm: 5,
      lid: true,
      material: "aluminium",
    },
    [0, TOP, 0],
    [...UPSIDE_DOWN]
  )
  const box = partOf(enclosure, "box")
  store().setPartsGrounded([box], true)
  mateFlipped("fixed", at(enclosure, "rim"), at(enclosure, "lidSeat"))
  store().assignBuiltin([box], "std.pc-clear")

  const pots: Placed[] = []
  for (const [name, x] of [
    ["Gain", -32],
    ["Tone", 0],
    ["Volume", 32],
  ] as const) {
    // Lugs to the front, over the board's pads; the knob turned so it points to the back.
    const pot = await panelPart(
      "control.pot",
      { shaftLengthMm: 18 },
      hole(box, `${name} hole`, [x, PANEL, -24], DOWN, [-1, 0, 0])
    )
    const knob = await generated("control.knob", {}, [0, 0, 0])
    mateFlipped("fixed", at(pot, "shaftTip"), at(knob, "bore"), Math.PI)
    store().renameGroup(pot.group, `${name} pot`)
    store().renameGroup(knob.group, `${name} knob`)
    pots.push(pot)
  }
  const jackHole = (name: string, x: number, into: Vec3) => hole(box, name, [x, 21.5, 4], into)
  const input = await panelPart(
    "connector.jack",
    { kind: "mono" },
    jackHole("Input hole", SIDE, [-1, 0, 0])
  )
  const output = await panelPart(
    "connector.jack",
    { kind: "mono" },
    jackHole("Output hole", -SIDE, [1, 0, 0])
  )
  const dc = await panelPart(
    "connector.jack",
    { kind: "dc", bushingDiameterMm: 11, bodyWidthMm: 10, bodyHeightMm: 10, bodyDepthMm: 13 },
    hole(box, "DC hole", [30, 18, -FRONT], [0, 0, 1])
  )
  const footswitch = await panelPart(
    "switch.footswitch",
    {},
    hole(box, "Footswitch hole", [0, PANEL, 26], DOWN, [1, 0, 0])
  )
  const led = await panelPart(
    "indicator.led",
    {},
    hole(box, "LED hole", [0, PANEL, 4], DOWN, [1, 0, 0]),
    "panel"
  )

  // Held in place, not mated: the battery lies on the base plate under the board, the board
  // hangs under the pots (pads to the front), zip tie mounts sit on the front wall.
  const battery = await generated(
    "battery.pp3",
    { snap: true },
    [-50, BASE + 8.75, -29],
    [...LYING_FLAT]
  )
  const board = await generated(
    "board.pcb",
    { widthMm: 64, depthMm: 26, pads: 12 },
    [0, 26, -22],
    [0, 1, 0, 0]
  )
  // Sized to what runs through them: one hook-up wire on the right, the twisted pair left.
  const tie = (bundleMm: number, x: number) =>
    generated(
      "cable.tieMount",
      { bundleMm, baseMm: 13, strapMm: 0.9 },
      [x, 20, FRONT],
      [...ON_FRONT_WALL]
    )
  const ties = [await tie(2, 30), await tie(3.5, -30)]
  store().setPartsGrounded(
    [battery, board, ...ties].map((p) => Object.values(p.parts)).flat(),
    true
  )

  const parts: PedalParts = { pots, input, output, dc, footswitch, led, battery, board, ties }
  wirePedal(parts)
  pedalCircuit(parts)
}
