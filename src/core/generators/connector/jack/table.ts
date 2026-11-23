import { estimated } from "../../common"

export const JACK_KINDS = ["mono", "stereo", "dc"] as const
export type JackKind = (typeof JACK_KINDS)[number]

/** What each kind takes and its contacts (lug names, in order along +u). */
export const JACKS = {
  mono: {
    name: "6.35 mm mono jack",
    plugMm: 6.35,
    lugs: ["Tip", "Sleeve", "Tip switch"],
    interface: "jack-6.35mm",
  },
  stereo: {
    name: "6.35 mm stereo jack",
    plugMm: 6.35,
    lugs: ["Tip", "Ring", "Sleeve"],
    interface: "jack-6.35mm",
  },
  dc: {
    name: "DC jack, 5.5 × 2.1 mm",
    plugMm: 5.5,
    lugs: ["Centre pin", "Sleeve", "Switch"],
    interface: "dc-5.5x2.1mm",
  },
} as const satisfies Record<
  JackKind,
  { name: string; plugMm: number; lugs: readonly string[]; interface: string }
>

/** Starting sizes; every one is a parameter (bodies differ most between makers). */
export const JACK_SIZES = {
  mono: {
    bushingDiameterMm: 9.5,
    bushingLengthMm: 9,
    bodyWidthMm: 16,
    bodyHeightMm: 13,
    bodyDepthMm: 22,
  },
  stereo: {
    bushingDiameterMm: 9.5,
    bushingLengthMm: 9,
    bodyWidthMm: 16,
    bodyHeightMm: 13,
    bodyDepthMm: 22,
  },
  dc: {
    bushingDiameterMm: 11,
    bushingLengthMm: 9,
    bodyWidthMm: 10,
    bodyHeightMm: 10,
    bodyDepthMm: 13,
  },
} as const

export const JACK_SOURCES = [
  {
    what: "Plug sizes",
    source: estimated(
      "6.35 mm (1/4 in) phone plugs; 5.5 mm outside × 2.1 mm pin DC barrel plugs (a de facto size)",
      "high"
    ),
  },
  {
    what: "Jack bodies",
    source: estimated(
      "Typical enclosed 6.35 mm panel jacks: 3/8 in threaded bushing about 9 mm long, body about 16 × 13 × 22 mm; panel DC jacks: about M11 bushing, round body about Ø10 × 13 mm. Check the datasheet of the part you use",
      "low"
    ),
  },
]
