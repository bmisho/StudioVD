import { createContext, useContext } from "react"
import { appCommands } from "./appCommands"
import type { CommandRegistry } from "./registry"

/** Lets tests render the shell with an injected registry; the app uses `appCommands`. */
export const CommandsContext = createContext<CommandRegistry>(appCommands)

export function useCommands(): CommandRegistry {
  return useContext(CommandsContext)
}
