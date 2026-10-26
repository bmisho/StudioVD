import { z } from "zod"
import { builtin, mm, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { METRIC_SOURCES, MetricSizeSchema, metric } from "../metric"
import { HEADS, screwBody } from "./heads"

const Params = z
  .object({
    size: MetricSizeSchema,
    /** Under the head to the tip (the nominal length of all three head types). */
    lengthMm: z.number().min(2).max(300),
    head: z.enum(HEADS),
  })
  .strict()
  .refine((p) => p.head !== "button" || metric(p.size).button, {
    message: "ISO 7380 button heads start at M3",
    path: ["head"],
  })

const HEAD_NAMES = {
  socket: "Socket head cap screw",
  button: "Button head screw",
  hex: "Hex head screw",
} as const
const STANDARDS = { socket: "ISO 4762", button: "ISO 7380-1", hex: "ISO 4017" } as const

/** A metric machine screw standing on its tip, the head up (Y). */
export const fastenerScrew = defineGenerator({
  id: "fastener.screw",
  major: 1,
  version: "1.0.0",
  name: "Machine screw",
  summary: "Metric screw with a socket, button or hex head (ISO 4762, 7380-1, 4017)",
  category: ["mechanical", "fasteners"],
  tags: ["screw", "bolt", "fastener", "metric"],
  designatorPrefix: "H",
  params: Params,
  defaults: { size: "M3", lengthMm: 10, head: "socket" },
  presets: [
    ...(["M2", "M2.5", "M3", "M4", "M5", "M6", "M8"] as const).map((size) => ({
      key: `cap${size.replace(".", "_")}`,
      name: `${size} × ${2 * metric(size).d + 4} socket head`,
      params: { size, lengthMm: 2 * metric(size).d + 4, head: "socket" },
    })),
    {
      key: "buttonM3",
      name: "M3 × 8 button head",
      params: { size: "M3", lengthMm: 8, head: "button" },
    },
    {
      key: "buttonM5",
      name: "M5 × 12 button head",
      params: { size: "M5", lengthMm: 12, head: "button" },
    },
    { key: "hexM6", name: "M6 × 20 hex head", params: { size: "M6", lengthMm: 20, head: "hex" } },
    {
      key: "hexM12",
      name: "M12 × 40 hex head",
      params: { size: "M12", lengthMm: 40, head: "hex" },
    },
  ],
  sources: METRIC_SOURCES,
  generate: ({ size, lengthMm: length, head }) => {
    const row = metric(size)
    const b = new BodyBuilder()
    const reach =
      head === "socket" ? row.cap.dk : head === "hex" ? row.hex.s : (row.button?.dk ?? 0)
    const { volume, top } = screwBody(b, size, length, head, segmentsFor(reach / 2))
    const anchor = (name: string, y: number, up: boolean, extra: Partial<GeneratedAnchor> = {}) =>
      ({
        body: "screw",
        name,
        kind: "axial",
        frame: { originMm: [0, y, 0], z: [0, up ? 1 : -1, 0], x: [1, 0, 0] },
        ...extra,
      }) satisfies GeneratedAnchor
    return {
      name: `${HEAD_NAMES[head]} ${size} × ${mm(length)} (${STANDARDS[head]})`,
      tags: [size.toLowerCase(), head],
      bodies: {
        screw: {
          name: `Screw ${size} × ${mm(length)}`,
          mesh: b.build(),
          material: "steel",
          collider: "hull",
          role: "fastener",
          volumeMm3: volume,
        },
      },
      rootBody: "screw",
      materials: { steel: builtin("std.steel") },
      anchors: {
        seat: anchor("Under the head", length, false, { interface: `${size}-screw`, role: "mate" }),
        tip: anchor("Tip", 0, false, { role: "reference" }),
        head: { ...anchor("Head top", top, true), kind: "planar", role: "reference" },
      },
      mates: {},
      suggestedMates: [
        { anchor: "seat", mateType: "fixed", flip: true, label: `Into an ${size} hole` },
      ],
      placement: { anchor: "seat", groundIfFirst: false },
    }
  },
})
