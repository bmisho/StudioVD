import { Fragment } from "react"
import { useCommands } from "@/app/commands/commandsContext"
import { isCommandEnabled } from "@/app/commands/registry"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useContextMenuStore } from "@/store/session/contextMenuStore"
import { CONTEXT_MENUS } from "./contextMenus"

/**
 * The one context menu (PLAN 15.4): opened at the pointer by the 3D view (a right click, not
 * a right drag), the scene tree and the schematic; its items are registry commands, so they
 * act on the selection exactly as the menu bar and the keys do.
 */
export function ContextMenuHost() {
  const open = useContextMenuStore((s) => s.open)
  const hide = useContextMenuStore((s) => s.hide)
  const registry = useCommands()
  if (!open) return null
  return (
    <DropdownMenu open onOpenChange={(next) => !next && hide()} modal={false}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none fixed size-px"
          style={{ left: open.x, top: open.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={0}
        className="min-w-48"
        aria-label="Context menu"
      >
        {CONTEXT_MENUS[open.place].map((id, i) => {
          if (id === null) return <DropdownMenuSeparator key={`sep-${i}`} />
          const command = registry.get(id)
          const enabled = isCommandEnabled(command)
          const shortcut = command.shortcuts?.[0]
          const run = () => {
            hide()
            registry.run(id)
          }
          return (
            <Fragment key={id}>
              {command.isChecked ? (
                <DropdownMenuCheckboxItem
                  checked={command.isChecked()}
                  disabled={!enabled}
                  onSelect={run}
                >
                  {command.label}
                  {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
                </DropdownMenuCheckboxItem>
              ) : (
                <DropdownMenuItem disabled={!enabled} onSelect={run}>
                  {command.label}
                  {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
                </DropdownMenuItem>
              )}
            </Fragment>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
