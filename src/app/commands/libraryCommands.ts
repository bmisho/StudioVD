import { MAX_COMPONENT_PARTS } from "@/core/library/userComponent/plan"
import { selectedPartIds } from "./partCommands"
import type { Command, CommandDeps } from "./types"

/** The component library's commands (PLAN 9.7). */
export function libraryCommands(deps: CommandDeps): Command[] {
  const { backend, session, reportError } = deps
  return [
    {
      id: "library.saveAsComponent",
      label: "Save as Component…",
      run: async () => {
        const done = await backend.saveAsComponent(selectedPartIds(deps))
        if (!done.ok) reportError(done.error, "Save as component")
      },
      isEnabled: () => {
        const n = selectedPartIds(deps).length
        return n >= 1 && n <= MAX_COMPONENT_PARTS && !session.getState().testMode
      },
      disabledReason: "Select 1 to 64 parts (not in test mode)",
    },
    {
      id: "settings.network",
      label: "Network Settings…",
      run: () => backend.openNetworkSettings(),
    },
  ]
}
