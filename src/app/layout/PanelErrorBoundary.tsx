import { Component, type ErrorInfo, type ReactNode } from "react"
import { CircleAlert, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  /** Shown in the fallback, e.g. "Schematic". */
  panelName: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Isolates a panel: a crash in the schematic must not take down the 3D view (PLAN.md 2.19).
 * "Reload panel" remounts the subtree.
 */
export class PanelErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Phase 15 routes this to the log file (tauri-plugin-log).
    console.error(`[${this.props.panelName}] panel crashed`, error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center"
      >
        <CircleAlert className="size-5 text-destructive" aria-hidden />
        <p className="font-medium">{this.props.panelName} stopped working</p>
        <p className="max-w-80 text-xs break-words text-muted-foreground">{error.message}</p>
        <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
          <RotateCcw /> Reload panel
        </Button>
      </div>
    )
  }
}
