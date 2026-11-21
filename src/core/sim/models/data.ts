import { choice, num, pin, signal, type ModelDef } from "./define"

const inBool = (key: string, name: string) => signal("in", key, name, "data", "", "bool")
const outBool = signal("out", "out", "Out", "data", "", "bool")

/** Data models (PLAN 11.3): constants, comparisons, logic and displays. */
export const DATA: ModelDef[] = [
  {
    id: "data.constant",
    major: 1,
    name: "Constant",
    summary: "A number on its output",
    category: "data",
    symbol: "constant",
    ports: [signal("out", "out", "Out", "data", "", "number")],
    params: [num("value", "Value", "", 1)],
  },
  {
    id: "data.comparator",
    major: 1,
    name: "Comparator",
    summary: "True while A > B (with hysteresis)",
    category: "data",
    symbol: "comparator",
    ports: [
      signal("in", "a", "A", "data", "", "number"),
      signal("in", "b", "B", "data", "", "number"),
      outBool,
    ],
    params: [num("hysteresis", "Hysteresis", "", 0, { min: 0 })],
  },
  {
    id: "data.logic",
    major: 1,
    name: "Logic gate",
    summary: "AND, OR, XOR, NAND or NOR of two inputs",
    category: "data",
    symbol: "logic",
    ports: [inBool("a", "A"), inBool("b", "B"), outBool],
    params: [choice("op", "Operation", ["and", "or", "xor", "nand", "nor"], "and")],
  },
  {
    id: "data.not",
    major: 1,
    name: "NOT",
    summary: "The opposite of its input",
    category: "data",
    symbol: "not",
    ports: [inBool("a", "In"), outBool],
    params: [],
  },
  {
    id: "data.display",
    major: 1,
    name: "Display",
    summary: "Shows the value on its input (a probe, an LCD)",
    category: "data",
    symbol: "display",
    ports: [
      pin("vcc", "VCC"),
      pin("gnd", "GND"),
      signal("in", "value", "Value", "data", "", "text"),
    ],
    params: [num("current", "Supply current", "A", 0.002, { min: 0 }, true)],
  },
  {
    id: "data.probe",
    major: 1,
    name: "Probe",
    summary: "Shows a number on the schematic",
    category: "data",
    symbol: "probe",
    ports: [signal("in", "value", "Value", "data", "", "number")],
    params: [],
  },
  // Adapters between a board's signal pins and circuits (Phase 12): a pin driving a load,
  // and a voltage read as ADC counts.
  {
    id: "data.pinOutput",
    major: 1,
    name: "Logic output",
    summary: "A pin as a circuit sees it: its duty times the logic high, behind its resistance",
    category: "data",
    symbol: "buffer",
    ports: [
      signal("in", "level", "Level", "data", "1", "pwm"),
      pin("out", "Out", "right"),
      pin("gnd", "GND", "bottom"),
    ],
    params: [
      num("high", "Logic high", "V", 5, { min: 0, max: 50 }),
      num("rOut", "Output resistance", "Ω", 25, { min: 0.01, max: 1e6 }, true),
      num("maxCurrent", "Maximum current", "A", 0.04, { min: 0, max: 10 }, true),
    ],
  },
  {
    id: "data.analogInput",
    major: 1,
    name: "Analog input",
    summary: "Reads a voltage as ADC counts",
    category: "data",
    symbol: "adc",
    ports: [
      pin("in", "In"),
      pin("gnd", "GND", "bottom"),
      signal("out", "counts", "Counts", "data", "1", "adc"),
    ],
    params: [
      num("vref", "Reference voltage", "V", 5, { min: 0.1, max: 50 }),
      num("bits", "Resolution", "bit", 10, { min: 1, max: 24 }),
    ],
  },
]
