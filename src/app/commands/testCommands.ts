import { createTestRig } from "@/core/scene/testRig"
import { prepareTestRigAssets } from "@/core/scene/testRigAssets"
import type { Command, CommandDeps } from "./types"

/** Test mode (PLAN 3.10): physics runs from the design pose; leaving it restores that pose. */
export function testCommands(deps: CommandDeps): Command[] {
  const { document, session, viewport, backend } = deps
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
      // Phase 3 demo: two blocks on a hinge (PLAN 3.8), as real, undoable document entities
      // with real geometry, so the rig saves and reopens like an import.
      id: "dev.insertTestRig",
      label: "Insert Physics Test Rig",
      run: async () => {
        const [base, leaf] = await prepareTestRigAssets()
        for (const { asset, glb } of [base, leaf]) {
          const written = await backend.writeAsset(asset.id, glb)
          // A plain browser has no workspace: the parts then draw as their boxes.
          if (!written.ok && written.error.kind !== "unavailable") {
            deps.reportError(written.error, "Insert test rig")
            return
          }
        }
        document.getState().insertEntities(createTestRig([base.asset, leaf.asset]))
        viewport.fitAllAfterChange()
      },
    },
  ]
}
