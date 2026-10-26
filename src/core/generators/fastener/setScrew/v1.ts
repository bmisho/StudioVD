import { z } from "zod"
import { degToRad } from "@/core/units"
import { builtin, estimated, mm, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import type { Vec2 } from "../../mesh/outline"
import { revolve, revolvedVolume } from "../../mesh/revolve"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { METRIC_SOURCES, MetricSizeSchema, metric } from "../metric"
import { toRuns } from "../screw/heads"
import { hexSocketTop } from "../socket"

const Params = z
  .object({
    size: MetricSizeSchema,
    lengthMm: z.number().min(2).max(60),
    point: z.enum(["flat", "cup"]),
  })
  .strict()
  .refine((p) => metric(p.size).set.t < p.lengthMm - 0.5, {
    message: "too short for its socket",
    path: ["lengthMm"],
  })

/** A hex socket set screw (ISO 4026 flat point, ISO 4029 cup point), socket up (Y). */
export const fastenerSetScrew = defineGenerator({
  id: "fastener.setScrew",
  major: 1,
  version: "1.0.0",
  name: "Set screw",
  summary: "Hex socket set screw, flat or cup point (ISO 4026, ISO 4029)",
  category: ["mechanical", "fasteners"],
  tags: ["set screw", "grub screw", "fastener", "metric"],
  designatorPrefix: "H",
  params: Params,
  defaults: { size: "M3", lengthMm: 4, point: "cup" },
  presets: [
    { key: "m3x3", name: "M3 × 3 cup point", params: { size: "M3", lengthMm: 3, point: "cup" } },
    { key: "m4x4", name: "M4 × 4 cup point", params: { size: "M4", lengthMm: 4, point: "cup" } },
    { key: "m5x5", name: "M5 × 5 flat point", params: { size: "M5", lengthMm: 5, point: "flat" } },
  ],
  sources: [
    ...METRIC_SOURCES,
    { what: "Cup point", source: estimated("Cup Ø half the thread, 118° recess", "medium") },
  ],
  generate: ({ size, lengthMm: length, point }) => {
    const { d, pitch, set } = metric(size)
    const r = d / 2
    const c = Math.min(pitch, r / 3)
    const n = segmentsFor(r)
    const cupR = point === "cup" ? d / 4 : 0
    const cupDepth = cupR / Math.tan(degToRad(59))
    const profile: Vec2[] = [
      ...(cupR > 0
        ? ([
            [0, cupDepth],
            [cupR, 0],
          ] as const)
        : ([[0, 0]] as const)),
      [r - c, 0],
      [r, c],
      [r, length - c],
      [r - c, length],
    ]
    const b = new BodyBuilder()
    revolve(b, toRuns(profile), n)
    const socket = hexSocketTop(b, length, r - c, n, set.s, set.t)
    const end = (name: string, y: number, up: boolean): GeneratedAnchor => ({
      body: "screw",
      name,
      kind: "axial",
      frame: { originMm: [0, y, 0], z: [0, up ? 1 : -1, 0], x: [1, 0, 0] },
    })
    return {
      name: `Set screw ${size} × ${mm(length)}, ${point} point`,
      tags: [size.toLowerCase(), point],
      bodies: {
        screw: {
          name: `Set screw ${size} × ${mm(length)}`,
          mesh: b.build(),
          material: "steel",
          collider: "hull",
          role: "fastener",
          volumeMm3: revolvedVolume([...profile, [0, length]]) - socket,
        },
      },
      rootBody: "screw",
      materials: { steel: builtin("std.steel") },
      anchors: {
        point: { ...end("Point", 0, false), interface: `${size}-screw`, role: "mate" },
        socket: { ...end("Socket end", length, true), role: "reference" },
      },
      mates: {},
      suggestedMates: [],
      placement: { anchor: "point", groundIfFirst: false },
    }
  },
})
