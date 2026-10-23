import type { LucideIcon } from "lucide-react"
import { Toolbar } from "radix-ui"
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
  /** Reactive disabled state (e.g. undo history); static command gating is read here. */
  disabled?: boolean
}

/**
 * Disabled buttons use aria-disabled, not `disabled`: they stay focusable and hoverable so
 * arrow-key navigation is stable and the tooltip can say why (WAI-ARIA toolbar pattern).
 */
export function ToolbarButton({ command, icon: Icon, pressed, disabled }: ToolbarButtonProps) {
  const registry = useCommands()
  const { label, shortcuts, availableInPhase, disabledReason } = registry.get(command)
  const off = (disabled ?? false) || !registry.isEnabled(command)
  let tip = shortcuts?.[0] ? `${label} (${shortcuts[0]})` : label
  if (availableInPhase) tip = `${label}: available in Phase ${availableInPhase}`
  else if (off && disabledReason) tip = `${label}: ${disabledReason}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toolbar.Button asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={pressed}
            aria-disabled={off || undefined}
            onClick={() => {
              if (!off) registry.run(command)
            }}
            className={cn(
              pressed && "bg-accent text-accent-foreground hover:bg-accent",
              "aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
            )}
          >
            <Icon />
          </Button>
        </Toolbar.Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}
