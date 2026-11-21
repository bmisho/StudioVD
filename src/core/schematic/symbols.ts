// Built-in block symbols (PLAN 11.3): SVG path data in a 40 × 24 box, stroked, unfilled. The
// app draws them (packs never carry drawings); the canvas and the SVG export share them.

export const SYMBOL_BOX = { width: 40, height: 24 } as const

const RING = "M10 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0"
const LEADS = "M0 12h10M30 12h10"
const CHIP = "M6 2h28v20h-28z"

const SYMBOLS: Readonly<Record<string, string>> = {
  resistor: "M0 12h10M30 12h10M10 7h20v10h-20z",
  potentiometer: "M0 12h10M30 12h10M10 7h20v10h-20zM13 21l14-18M27 3l-4 1M27 3l-1 4",
  capacitor: "M0 12h17M23 12h17M17 4v16M23 4v16",
  inductor: "M0 12h6a3.5 3.5 0 0 1 7 0a3.5 3.5 0 0 1 7 0a3.5 3.5 0 0 1 7 0a3.5 3.5 0 0 1 7 0h6",
  battery: "M0 12h16M16 4v16M22 8v8M22 12h18",
  supply: `${LEADS}${RING}M20 6v5M17.5 8.5h5M17.5 16h5`,
  ground: "M20 0v10M10 10h20M13 15h14M17 20h6",
  switch: "M0 12h12M28 12h12M12 12l15-8",
  led: "M0 12h14M26 12h14M14 5v14l12-7zM26 5v14M25 4l5-4M30 0h-3M30 0v3M29 7l5-4M34 3h-3M34 3v3",
  diode: "M0 12h14M26 12h14M14 5v14l12-7zM26 5v14",
  fuse: "M0 12h10M30 12h10M10 8h20v8h-20zM10 12h20",
  relay: "M2 7h12v10h-12zM14 12h4M18 17h4l12-8M34 17h4",
  voltmeter: `${LEADS}${RING}M16 8l4 8 4-8`,
  ammeter: `${LEADS}${RING}M16 17l4-10 4 10M17.5 13.5h5`,
  motor: `${LEADS}${RING}M15 16v-8l5 5 5-5v8`,
  servo: "M0 12h8M32 12h8M8 4h24v16h-24zM15 16v-8l5 5 5-5v8",
  stepper: `${LEADS}${RING}M14 16h4v-4h4v-4h4`,
  solenoid: "M4 6h20v12h-20zM24 12h12M8 6v12M12 6v12M16 6v12M20 6v12",
  pump: `${LEADS}${RING}M14 16l6-10 6 10z`,
  fan: `${LEADS}${RING}M20 12l-5-5M20 12l7-2M20 12l-2 7`,
  hBridge: `${CHIP}M15 7v10M25 7v10M15 12h10`,
  stepperDriver: `${CHIP}M12 17h5v-5h5v-5h6`,
  mosfet: "M2 14h8M10 6v16M14 6v4M14 12v4M14 18v4M14 8h10V0M14 20h10v4M14 14h10v6",
  mechGround: "M4 8h32M8 8l-4 6M14 8l-4 6M20 8l-4 6M26 8l-4 6M32 8l-4 6M20 0v8",
  gear: "M5 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0",
  leadScrew: "M2 12h36M8 6l4 12M14 6l4 12M20 6l4 12M26 6l4 12",
  spring: "M0 12H6L9 5L14 19L19 5L24 19L29 5L32 12H40",
  damper: "M0 12H16M16 7V17M10 4H26V20H10M26 12H40",
  load: "M12 22H28L25 9H15ZM20 9V2",
  pressureSource: `${LEADS}${RING}M20 18V6M16 10l4-4 4 4`,
  restriction: "M0 12h40M12 4l8 6 8-6M12 20l8-6 8 6",
  valve: "M0 12h10M30 12h10M10 5v14l20-14v14z",
  checkValve: "M0 12h14M14 4v16M14 4l12 8-12 8M18 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M28 12h12",
  cylinder: "M2 6h24v12h-24zM14 6v12M14 12h24",
  emitter:
    "M14 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0M20 1v3M20 20v3M9 12h3M28 12h3M13 5l2 2M27 5l-2 2M13 19l2-2M27 19l-2-2",
  lightSensor: "M18 7h16v10h-16zM4 2l9 6M13 8h-4M13 8l-1-4M4 10l9 6M13 16h-4M13 16l-1-4",
  attenuator: "M20 2a14 14 0 0 1 0 20a14 14 0 0 1 0-20zM0 12h40",
  constant: "M8 4h24v16h-24zM15 10h10M15 14h10",
  comparator: "M10 3v18l20-9zM13 8h4M15 6v4M13 16h4M0 8h10M0 16h10M30 12h10",
  logic: "M8 3h12a9 9 0 0 1 0 18h-12zM0 8h8M0 16h8M29 12h11",
  not: "M8 3v18l18-9zM26 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M30 12h10M0 12h8",
  display: "M4 3h32v18h-32zM8 7h24v10h-24z",
  probe: "M8 10a6 6 0 1 0 12 0a6 6 0 1 0-12 0M18 14l8 8",
  mcu: "M8 2h24v20h-24zM4 6h4M4 12h4M4 18h4M32 6h4M32 12h4M32 18h4",
}

/** A black box, or a symbol a newer StudioVD drew. */
const GENERIC = "M8 4h24v16h-24zM14 10h12M14 14h8"

export const symbolPath = (name: string | undefined): string =>
  name !== undefined && Object.hasOwn(SYMBOLS, name) ? (SYMBOLS[name] ?? GENERIC) : GENERIC

export const SYMBOL_NAMES: readonly string[] = Object.keys(SYMBOLS)
