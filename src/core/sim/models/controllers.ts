import { pin, signal, type ModelDef } from "./define"
import type { Port } from "@/core/schema/schematic"

/** A board's pins: power terminals, digital outputs (PWM-capable) and analog inputs. */
function board(digital: string[], analog: string[], power: Port[]): Port[] {
  return [
    ...power,
    ...analog.map((a) => signal("in", a, a, "data", "1", "adc")),
    ...digital.map((d) => signal("out", d, d, "data", "1", "pwm")),
  ]
}

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`)

const program = {
  category: "controllers" as const,
  symbol: "mcu",
  params: [],
  programmable: true,
}

/**
 * Controller boards (PLAN 11.3) as black boxes: their pins are typed ports, their program is
 * the user's, in the sandboxed expression language (`D9 = A0 > 512 ? 1 : 0`).
 */
export const CONTROLLERS: ModelDef[] = [
  {
    id: "mcu.arduinoUno",
    major: 1,
    name: "Arduino Uno",
    summary: "ATmega328P board: 14 digital pins (D2-D13 here), 6 analog inputs",
    ports: board(range("D", 2, 13), range("A", 0, 5), [
      pin("vin", "VIN"),
      pin("v5", "5V"),
      pin("gnd", "GND"),
    ]),
    ...program,
  },
  {
    id: "mcu.arduinoNano",
    major: 1,
    name: "Arduino Nano",
    summary: "ATmega328P board: D2-D13, A0-A7",
    ports: board(range("D", 2, 13), range("A", 0, 7), [
      pin("vin", "VIN"),
      pin("v5", "5V"),
      pin("gnd", "GND"),
    ]),
    ...program,
  },
  {
    id: "mcu.esp32",
    major: 1,
    name: "ESP32 DevKitC",
    summary: "ESP32 board, 3.3 V logic",
    ports: board(
      [
        "GPIO2",
        "GPIO4",
        "GPIO5",
        "GPIO13",
        "GPIO14",
        "GPIO16",
        "GPIO17",
        "GPIO18",
        "GPIO19",
        "GPIO21",
        "GPIO22",
        "GPIO23",
      ],
      ["GPIO32", "GPIO33", "GPIO34", "GPIO35", "GPIO36", "GPIO39"],
      [pin("vin", "5V"), pin("v3", "3V3"), pin("gnd", "GND")]
    ),
    ...program,
  },
  {
    id: "mcu.pico",
    major: 1,
    name: "Raspberry Pi Pico",
    summary: "RP2040 board, 3.3 V logic",
    ports: board(
      range("GP", 0, 15),
      ["GP26", "GP27", "GP28"],
      [pin("vsys", "VSYS"), pin("v3", "3V3"), pin("gnd", "GND")]
    ),
    ...program,
  },
]
