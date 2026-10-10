import { useCommands } from "@/app/commands/commandsContext"
import { isCommandEnabled } from "@/app/commands/registry"
import type { CommandId } from "@/app/commands/types"
import { MenubarCheckboxItem, MenubarItem, MenubarShortcut } from "@/components/ui/menubar"

/**
 * One menu entry bound to a command. Menu content mounts only while a menu is open, so
 * reading enabled/checked state at render time is always fresh without subscriptions.
 */
export function CommandMenuItem({ id }: { id: CommandId }) {
  const registry = useCommands()
  const command = registry.get(id)
  const enabled = isCommandEnabled(command)
  const shortcut = command.shortcuts?.[0]
  const label = command.availableInPhase
    ? `${command.label} (Phase ${command.availableInPhase})`
    : command.label

  if (command.isChecked) {
    return (
      <MenubarCheckboxItem
        checked={command.isChecked()}
        disabled={!enabled}
        onSelect={() => registry.run(id)}
      >
        {label}
        {shortcut && <MenubarShortcut>{shortcut}</MenubarShortcut>}
      </MenubarCheckboxItem>
    )
  }

  return (
    <MenubarItem disabled={!enabled} onSelect={() => registry.run(id)}>
      {label}
      {shortcut && <MenubarShortcut>{shortcut}</MenubarShortcut>}
    </MenubarItem>
  )
}
