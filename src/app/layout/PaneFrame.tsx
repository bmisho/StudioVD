import type { ReactNode } from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Pane } from "@/store/session/sessionStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { PanelErrorBoundary } from "./PanelErrorBoundary"

interface PaneFrameProps {
  pane: Pane
  title: string
  children: ReactNode
}

/** Header (title + maximize/restore) around one of the two central panes. */
export function PaneFrame({ pane, title, children }: PaneFrameProps) {
  const maximized = useSessionStore((s) => s.maximizedPane === pane)
  const toggleMaximize = useSessionStore((s) => s.toggleMaximize)
  const Icon = maximized ? Minimize2 : Maximize2
  const action = maximized ? `Restore ${title}` : `Maximize ${title}`

  return (
    <section aria-label={title} className="flex h-full min-h-0 min-w-0 flex-col">
      <header
        className="flex h-9 shrink-0 items-center justify-between border-b bg-surface pr-1.5 pl-3"
        onDoubleClick={() => toggleMaximize(pane)}
      >
        <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={action}
          title={action}
          onClick={() => toggleMaximize(pane)}
        >
          <Icon />
        </Button>
      </header>
      <div className="relative min-h-0 flex-1">
        <PanelErrorBoundary panelName={title}>{children}</PanelErrorBoundary>
      </div>
    </section>
  )
}
