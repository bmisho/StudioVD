import { bearingDeepGroove } from "./bearing/deepGroove/v1"
import { fastenerNut } from "./fastener/nut/v1"
import { fastenerScrew } from "./fastener/screw/v1"
import { fastenerSetScrew } from "./fastener/setScrew/v1"
import { fastenerStandoff } from "./fastener/standoff/v1"
import { fastenerWasher } from "./fastener/washer/v1"
import { stockShaft } from "./stock/shaft/v1"
import { stockTube } from "./stock/tube/v1"
import { gearSpur } from "./gear/spur/v1"
import { pulleyGt2 } from "./pulley/gt2/v1"
import { motionLeadScrew } from "./motion/leadScrew/v1"
import { motionLeadScrewNut } from "./motion/leadScrewNut/v1"
import { springCompression } from "./spring/compression/v1"
import { springExtension } from "./spring/extension/v1"
import { frameCornerBracket } from "./frame/cornerBracket/v1"
import { frameTslot } from "./frame/tslot/v1"
import { connectorPinHeader } from "./connector/pinHeader/v1"
import { batteryCell } from "./battery/cell/v1"
import { batteryPp3 } from "./battery/pp3/v1"
import { boardPcb } from "./board/pcb/v1"
import { indicatorLed } from "./indicator/led/v1"
import { cableClip } from "./cable/clip/v1"
import { cableZipTie } from "./cable/zipTie/v1"
import { enclosureBox } from "./enclosure/box/v1"
import { containerEurobox } from "./container/eurobox/v1"
import { connectorJack } from "./connector/jack/v1"
import { controlKnob } from "./control/knob/v1"
import { switchFootswitch } from "./switch/footswitch/v1"
import { controlPot } from "./control/pot/v1"
import { primitiveBox } from "./primitive/box/v1"
import { primitiveCone } from "./primitive/cone/v1"
import { primitiveCylinder } from "./primitive/cylinder/v1"
import { primitiveSphere } from "./primitive/sphere/v1"
import type { AnyGenerator } from "./types"

/** Every in-app generator (PLAN 9.3), by id and MAJOR. Packs refer to these, never to code. */
export const GENERATORS: readonly AnyGenerator[] = [
  primitiveBox,
  primitiveCylinder,
  primitiveSphere,
  primitiveCone,
  fastenerScrew,
  fastenerNut,
  fastenerWasher,
  fastenerSetScrew,
  fastenerStandoff,
  bearingDeepGroove,
  stockShaft,
  stockTube,
  gearSpur,
  pulleyGt2,
  motionLeadScrew,
  motionLeadScrewNut,
  springCompression,
  springExtension,
  frameTslot,
  frameCornerBracket,
  connectorPinHeader,
  batteryCell,
  enclosureBox,
  containerEurobox,
  controlPot,
  controlKnob,
  connectorJack,
  switchFootswitch,
  batteryPp3,
  boardPcb,
  indicatorLed,
  cableClip,
  cableZipTie,
]

/** The generator a manifest names, or undefined (unknown id, or a MAJOR this app lacks). */
export function findGenerator(id: string, major: number): AnyGenerator | undefined {
  return GENERATORS.find((g) => g.id === id && g.major === major)
}
