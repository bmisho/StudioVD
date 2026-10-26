import { z } from "zod"
import { BD_WAREHOUSE, estimated, standard } from "../common"

/** Metric sizes the fastener generators make (ISO 261 coarse threads). */
export const METRIC_SIZES = ["M2", "M2.5", "M3", "M4", "M5", "M6", "M8", "M10", "M12"] as const
export const MetricSizeSchema = z.enum(METRIC_SIZES)
export type MetricSize = z.infer<typeof MetricSizeSchema>

interface Row {
  /** Nominal diameter and coarse pitch (ISO 261). */
  d: number
  pitch: number
  /** ISO 4762 socket head cap screw: head diameter (max, plain), height, socket, its depth. */
  cap: { dk: number; k: number; s: number; t: number }
  /** ISO 7380-1 button head (from M3). */
  button?: { dk: number; k: number; s: number; t: number }
  /** ISO 4017 hex head: across flats and nominal head height. */
  hex: { s: number; k: number }
  /** ISO 4032 hex nut (style 1): across flats and height. */
  nut: { s: number; m: number }
  /** ISO 7089 plain washer, normal series: inner and outer diameter, nominal thickness. */
  washer: { d1: number; d2: number; h: number }
  /** ISO 4026/4029 set screw socket: across flats and an estimated depth. */
  set: { s: number; t: number }
}

// Written from the standards' tables (nominal values; the cap head diameter is the plain
// head's maximum). Cross-checked: bd_warehouse lists knurled-head dk maxima for ISO 4762
// (e.g. M3 5.68), washer thickness maxima for ISO 7089 (M3 0.55) and button sockets as maxima;
// the nominal values here lie within those tolerances.
const ROWS: Record<MetricSize, Row> = {
  M2: {
    d: 2,
    pitch: 0.4,
    cap: { dk: 3.8, k: 2, s: 1.5, t: 1 },
    hex: { s: 4, k: 1.4 },
    nut: { s: 4, m: 1.6 },
    washer: { d1: 2.2, d2: 5, h: 0.3 },
    set: { s: 0.9, t: 0.8 },
  },
  "M2.5": {
    d: 2.5,
    pitch: 0.45,
    cap: { dk: 4.5, k: 2.5, s: 2, t: 1.1 },
    hex: { s: 5, k: 1.7 },
    nut: { s: 5, m: 2 },
    washer: { d1: 2.7, d2: 6, h: 0.5 },
    set: { s: 1.3, t: 1.1 },
  },
  M3: {
    d: 3,
    pitch: 0.5,
    cap: { dk: 5.5, k: 3, s: 2.5, t: 1.3 },
    button: { dk: 5.7, k: 1.65, s: 2, t: 1.04 },
    hex: { s: 5.5, k: 2 },
    nut: { s: 5.5, m: 2.4 },
    washer: { d1: 3.2, d2: 7, h: 0.5 },
    set: { s: 1.5, t: 1.5 },
  },
  M4: {
    d: 4,
    pitch: 0.7,
    cap: { dk: 7, k: 4, s: 3, t: 2 },
    button: { dk: 7.6, k: 2.2, s: 2.5, t: 1.3 },
    hex: { s: 7, k: 2.8 },
    nut: { s: 7, m: 3.2 },
    washer: { d1: 4.3, d2: 9, h: 0.8 },
    set: { s: 2, t: 1.8 },
  },
  M5: {
    d: 5,
    pitch: 0.8,
    cap: { dk: 8.5, k: 5, s: 4, t: 2.5 },
    button: { dk: 9.5, k: 2.75, s: 3, t: 1.56 },
    hex: { s: 8, k: 3.5 },
    nut: { s: 8, m: 4.7 },
    washer: { d1: 5.3, d2: 10, h: 1 },
    set: { s: 2.5, t: 2.7 },
  },
  M6: {
    d: 6,
    pitch: 1,
    cap: { dk: 10, k: 6, s: 5, t: 3 },
    button: { dk: 10.5, k: 3.3, s: 4, t: 2.08 },
    hex: { s: 10, k: 4 },
    nut: { s: 10, m: 5.2 },
    washer: { d1: 6.4, d2: 12, h: 1.6 },
    set: { s: 3, t: 3 },
  },
  M8: {
    d: 8,
    pitch: 1.25,
    cap: { dk: 13, k: 8, s: 6, t: 4 },
    button: { dk: 14, k: 4.4, s: 5, t: 2.6 },
    hex: { s: 13, k: 5.3 },
    nut: { s: 13, m: 6.8 },
    washer: { d1: 8.4, d2: 16, h: 1.6 },
    set: { s: 4, t: 4 },
  },
  M10: {
    d: 10,
    pitch: 1.5,
    cap: { dk: 16, k: 10, s: 8, t: 5 },
    button: { dk: 17.5, k: 5.5, s: 6, t: 3.12 },
    hex: { s: 16, k: 6.4 },
    nut: { s: 16, m: 8.4 },
    washer: { d1: 10.5, d2: 20, h: 2 },
    set: { s: 5, t: 5 },
  },
  M12: {
    d: 12,
    pitch: 1.75,
    cap: { dk: 18, k: 12, s: 10, t: 6 },
    button: { dk: 21, k: 6.6, s: 8, t: 4.16 },
    hex: { s: 18, k: 7.5 },
    nut: { s: 18, m: 10.8 },
    washer: { d1: 13, d2: 24, h: 2.5 },
    set: { s: 6, t: 6 },
  },
}

export const metric = (size: MetricSize): Row => ROWS[size]

export const METRIC_SOURCES = [
  { what: "Coarse pitches", source: standard("ISO 261") },
  { what: "Socket head cap screws", source: standard(`ISO 4762; ${BD_WAREHOUSE}`) },
  { what: "Button head screws", source: standard(`ISO 7380-1; ${BD_WAREHOUSE}`, "medium") },
  { what: "Hex head screws", source: standard(`ISO 4017; ${BD_WAREHOUSE}`) },
  { what: "Hex nuts", source: standard(`ISO 4032; ${BD_WAREHOUSE}`) },
  { what: "Plain washers", source: standard(`ISO 7089 (nominal thickness); ${BD_WAREHOUSE}`) },
  {
    what: "Set screw sockets",
    source: estimated(`ISO 4026 socket sizes; depths from ${BD_WAREHOUSE}`, "medium"),
  },
  {
    what: "Thread form",
    source: estimated("Threads are drawn as plain cylinders at the nominal diameter", "high"),
  },
]
