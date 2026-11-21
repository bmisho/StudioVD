// Reference designators for a block linked to a plain part (PLAN 11.6): the usual letter of
// its kind (IEEE 315 / IEC 81346 habits), else a generic unit.

const BY_MODEL: Readonly<Record<string, string>> = {
  "electrical.battery": "BT",
  "electrical.supply": "PS",
  "electrical.resistor": "R",
  "electrical.potentiometer": "RV",
  "electrical.capacitor": "C",
  "electrical.inductor": "L",
  "electrical.switch": "SW",
  "electrical.led": "LED",
  "electrical.diode": "D",
  "electrical.fuse": "F",
  "electrical.relay": "K",
  "electromech.dcMotor": "M",
  "electromech.servo": "M",
  "electromech.stepper": "M",
  "electromech.pump": "M",
  "electromech.fan": "M",
  "electromech.solenoid": "L",
  "driver.mosfet": "Q",
  "mechanical.spring": "S",
  "light.emitter": "LED",
}

/** `electrical.resistor@1` → `R`; anything else (or a black box) → `U`. */
export function designatorPrefix(simModel: string | undefined): string {
  const id = simModel?.split("@")[0] ?? ""
  return Object.hasOwn(BY_MODEL, id) ? (BY_MODEL[id] ?? "U") : "U"
}
