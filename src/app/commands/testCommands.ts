import { createTestRig } from "@/core/scene/testRig"
import type { Command, CommandDeps } from "./types"

/** Test mode (PLAN 3.10): physics runs from the design pose; leaving it restores that pose. */
export function testCommands({ document, session, viewport }: CommandDeps): Command[] {
  const s = () => session.getState()
  return [
    {
      id: "test.toggle",
      label: "Test Mode",
      run: () => s().toggleTestMode(),
      isChecked: () => s().testMode,
    },
    {
      id: "test.reset",
      label: "Reset to Design Pose",
      run: () => s().restartTestMode(),
      isEnabled: () => s().testMode,
    },
    {
      // Phase 3 demo: two blocks on a hinge (PLAN 3.8), as real, undoable document entities.
      id: "dev.insertTestRig",
      label: "Insert Physics Test Rig",
      run: () => {
        document.getState().insertEntities(createTestRig())
        viewport.fitAllAfterChange()
      },
    },
  ]
}
