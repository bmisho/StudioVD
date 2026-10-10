import type { LucideIcon } from "lucide-react"
import { useCommands } from "@/app/commands/commandsContext"
import type { CommandId } from "@/app/commands/types"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ToolbarButtonProps {
  command: CommandId
  icon: LucideIcon
  /** Pressed state for toggles; the caller subscribes to the store so this re-renders. */
  pressed?: boolean
  disabled?: boolean
}

export function ToolbarButton({ command, icon: Icon, pressed, disabled }: ToolbarButtonProps) {
  const registry = useCommands()
  const { label, shortcuts } = registry.get(command)
  const tip = shortcuts?.[0] ? `${label} (${shortcuts[0]})` : label

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={() => registry.run(command)}
          className={cn(pressed && "bg-accent text-accent-foreground hover:bg-accent")}
        >
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}
