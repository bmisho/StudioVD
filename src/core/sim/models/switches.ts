import { flag, num, pin, signal, type ModelDef } from "./define"

/** Switches with a memory of their own (0.2.2): kept apart from the plain electrical list. */
export const SWITCHES: ModelDef[] = [
  {
    id: "electrical.latchingSwitch",
    major: 1,
    name: "Latching push switch",
    summary: "Each press toggles it, like a stomp footswitch; the press can come from a 3D plunger",
    category: "electrical",
    symbol: "switch",
    ports: [
      pin("a", "A"),
      pin("b", "B", "right"),
      signal("in", "press", "Pressed", "data", "", "bool"),
    ],
    params: [
      flag("closed", "Closed at start", true),
      num("rOn", "Contact resistance", "Ω", 0.05, { min: 0 }, true),
    ],
  },
]
