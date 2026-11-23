import { z } from "zod"
import { builtin, mm, segmentsFor } from "../../common"
import { axialY, lugAnchors, lugTabs, type Lug } from "../../control/parts"
import { BLACK_PBT } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { circle, outlineArea, rectangle } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { stack } from "../../mesh/stack"
import { defineGenerator } from "../../types"
import { JACK_KINDS, JACK_SIZES, JACK_SOURCES, JACKS, type JackKind } from "./table"

const Params = z
  .object({
    kind: z.enum(JACK_KINDS),
    bushingDiameterMm: z.number().min(6).max(20),
    bushingLengthMm: z.number().min(2).max(30),
    bodyWidthMm: z.number().min(6).max(40),
    bodyHeightMm: z.number().min(6).max(40),
    bodyDepthMm: z.number().min(5).max(60),
  })
  .strict()
  .refine(
    (p) => p.bushingDiameterMm > JACKS[p.kind].plugMm + 1.5,
    "the bushing must be wider than the plug"
  )

const preset = (kind: JackKind) => ({ kind, ...JACK_SIZES[kind] })

/**
 * A panel-mount jack (PLAN 16.4): its body behind the panel (y = 0 is the mounting face), a
 * threaded bushing through it with the socket the plug enters along −Y, and solder lugs out
 * of the body's underside (cable ends). Box body for 6.35 mm jacks, round for DC jacks.
 */
export const connectorJack = defineGenerator({
  id: "connector.jack",
  major: 1,
  version: "1.0.0",
  name: "Panel jack",
  summary: "Panel-mount 6.35 mm (mono or stereo) or 5.5 × 2.1 mm DC jack with solder lugs",
  category: ["electrical", "connectors"],
  tags: ["jack", "6.35mm", "1/4 inch", "dc jack", "barrel", "pedal", "audio"],
  designatorPrefix: "J",
  params: Params,
  defaults: preset("mono"),
  presets: JACK_KINDS.map((kind) => ({ key: kind, name: JACKS[kind].name, params: preset(kind) })),
  sources: JACK_SOURCES,
  generate: (p) => {
    const spec = JACKS[p.kind]
    const round = p.kind === "dc"
    const b = new BodyBuilder()
    const [W, H, D] = [p.bodyWidthMm, p.bodyHeightMm, p.bodyDepthMm]
    const bodyOutline = round ? circle(W / 2, segmentsFor(W / 2)) : rectangle(W, H)
    extrude(b, bodyOutline, [], -D, 0)
    let volume = outlineArea(bodyOutline) * D
    // The bushing, sunk 0.5 mm into the body so the two never share a face, with the socket.
    const rb = p.bushingDiameterMm / 2
    const hole = (spec.plugMm + 0.2) / 2
    volume += stack(
      b,
      [{ outline: circle(rb, segmentsFor(rb)), y0: -0.5, y1: p.bushingLengthMm }],
      circle(hole, segmentsFor(hole)),
      1
    )
    if (p.kind === "dc") {
      // The centre pin, inside the socket.
      const pin = circle(1.05, 12)
      extrude(b, pin, [], p.bushingLengthMm - 8, p.bushingLengthMm - 1, 1)
      volume += outlineArea(pin) * 7
    }
    const edge = round ? W / 2 : H / 2
    const lugs: Lug[] = spec.lugs.map((_, i) => ({
      u: (i - (spec.lugs.length - 1) / 2) * Math.min(5, (W - 3) / spec.lugs.length),
      from: edge - 2.5,
      tip: edge + 5,
      y: -D / 2,
    }))
    volume += lugTabs(b, lugs, 2, 0.5, 2)
    return {
      name: `${spec.name}, ${mm(p.bushingDiameterMm)} mm bushing`,
      tags: [p.kind],
      bodies: {
        jack: {
          name: spec.name,
          mesh: b.build(),
          material: "body",
          slots: [
            { name: "Body", material: "body" },
            { name: "Bushing", material: "metal" },
            { name: "Lugs", material: "lugs" },
          ],
          collider: "hull",
          role: "body",
          volumeMm3: volume,
        },
      },
      rootBody: "jack",
      materials: { body: BLACK_PBT(), metal: builtin("std.steel"), lugs: builtin("std.brass") },
      anchors: {
        mount: axialY("jack", "Mounting face", 0, true, {
          kind: "planar",
          role: "mount",
          interface: "panel",
        }),
        bushing: axialY("jack", "Bushing", 0, true, {
          role: "mate",
          interface: `bushing-${mm(p.bushingDiameterMm)}mm`,
        }),
        socket: axialY("jack", "Socket", p.bushingLengthMm, true, {
          role: "mate",
          interface: spec.interface,
        }),
        ...lugAnchors("jack", lugs, spec.lugs),
      },
      mates: {},
      suggestedMates: [{ anchor: "mount", mateType: "fixed", flip: true, label: "Behind a panel" }],
      placement: { anchor: "mount", groundIfFirst: false },
    }
  },
})
