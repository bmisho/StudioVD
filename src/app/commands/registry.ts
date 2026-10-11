import { editCommands } from "./editCommands"
import { partCommands } from "./partCommands"
import { fileCommands } from "./fileCommands"
import { testCommands } from "./testCommands"
import type { Command, CommandDeps, CommandId } from "./types"
import { viewCommands } from "./viewCommands"
import { navigationCommands, viewOrientationCommands } from "./viewOrientationCommands"

export interface CommandRegistry {
  readonly list: readonly Command[]
  get: (id: CommandId) => Command
  /** Runs the command if it is enabled. Returns whether it ran. */
  run: (id: CommandId) => boolean
  isEnabled: (id: CommandId) => boolean
}

export function isCommandEnabled(command: Command): boolean {
  return command.isEnabled ? command.isEnabled() : true
}

export function createCommandRegistry(deps: CommandDeps): CommandRegistry {
  const list = [
    ...fileCommands(deps),
    ...editCommands(deps),
    ...partCommands(deps),
    ...viewCommands(deps),
    ...viewOrientationCommands(deps),
    ...navigationCommands(deps),
    ...testCommands(deps),
  ]
  const byId = new Map(list.map((c) => [c.id, c]))
  if (byId.size !== list.length) throw new Error("Duplicate command id in registry")

  const get = (id: CommandId): Command => {
    const command = byId.get(id)
    if (!command) throw new Error(`Unknown command: ${id}`)
    return command
  }

  return {
    list,
    get,
    isEnabled: (id) => isCommandEnabled(get(id)),
    run: (id) => {
      const command = get(id)
      if (!isCommandEnabled(command)) return false
      void command.run()
      return true
    },
  }
}
