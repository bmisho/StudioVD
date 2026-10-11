import { useCommands } from "@/app/commands/commandsContext"
import type { CommandId } from "@/app/commands/types"
import { MenubarRadioGroup, MenubarRadioItem } from "@/components/ui/menubar"

/**
 * Mutually exclusive commands (e.g. mouse navigation presets) as menu radio items. Like
 * CommandMenuItem, it reads state at render time: menu content mounts only while open.
 */
export function CommandRadioGroup({ ids }: { ids: readonly CommandId[] }) {
  const registry = useCommands()
  const checked = ids.find((id) => registry.get(id).isChecked?.()) ?? ""
  return (
    <MenubarRadioGroup
      value={checked}
      onValueChange={(id) => {
        const match = ids.find((candidate) => candidate === id)
        if (match) registry.run(match)
      }}
    >
      {ids.map((id) => (
        <MenubarRadioItem key={id} value={id}>
          {registry.get(id).label}
        </MenubarRadioItem>
      ))}
    </MenubarRadioGroup>
  )
}
