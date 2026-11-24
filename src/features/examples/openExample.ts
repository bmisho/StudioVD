import { toastNotifier } from "@/lib/notify"
import { projectController } from "@/features/project/projectService"
import { requestSchematicFit } from "@/features/schematic/fitRequest"
import { viewportBridge } from "@/features/viewport/viewportBridge"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory } from "@/store/document/history"
import { guitarPedal } from "./guitarPedal"
import { hingeDimmer } from "./hingeDimmer"
import { leverTorque } from "./leverTorque"
import { lightPath } from "./lightPath"
import { limitSwitch } from "./limitSwitch"

// Help › Examples (PLAN 13.5): each builds a new, unsaved project from scratch.

export const EXAMPLES = {
  hingeDimmer: { name: "Hinge dims an LED", build: hingeDimmer },
  limitSwitch: { name: "Limit switch cuts a motor", build: limitSwitch },
  leverTorque: { name: "Lever torque sets servo current", build: leverTorque },
  lightPath: { name: "Light path blocked by a part", build: lightPath },
  guitarPedal: { name: "Guitar pedal", build: guitarPedal },
} as const

export type ExampleId = keyof typeof EXAMPLES

/** A new project (after the unsaved-changes question), then the example built into it. */
export async function openExample(id: ExampleId): Promise<void> {
  const before = useDocumentStore.getState().doc
  await projectController.newProject()
  if (useDocumentStore.getState().doc === before) return // cancelled, or New failed
  try {
    await EXAMPLES[id].build()
    requestSchematicFit()
    viewportBridge.fitAllAfterChange()
    // The example is where the project starts: nothing to undo back through.
    documentHistory.clear()
  } catch (e) {
    toastNotifier.error(
      "The example could not be built",
      e instanceof Error ? e.message : String(e)
    )
  }
}
