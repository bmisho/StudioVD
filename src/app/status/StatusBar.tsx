import { APP_VERSION } from "@/core/app-info"
import { useSessionStore } from "@/store/session/sessionStore"

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="tabular-nums">
      <span className="text-muted-foreground">{label} </span>
      {value}
    </span>
  )
}

const SIM_LABEL = { idle: "Idle", solving: "Solving…", error: "Error" } as const

export function StatusBar() {
  const selectionCount = useSessionStore((s) => s.selection.length)
  const testMode = useSessionStore((s) => s.testMode)
  const simStatus = useSessionStore((s) => s.simStatus)
  const projection = useSessionStore((s) => s.projection)

  return (
    <footer
      aria-label="Status bar"
      className="flex h-6 shrink-0 items-center gap-4 border-t bg-surface px-3 text-xs"
    >
      <StatusItem label="Selected" value={String(selectionCount)} />
      <StatusItem label="Mode" value={testMode ? "Test" : "Design"} />
      <StatusItem label="View" value={projection === "perspective" ? "Perspective" : "Ortho"} />
      <StatusItem label="Units" value="mm" />
      <StatusItem label="Simulation" value={SIM_LABEL[simStatus]} />
      <span className="ml-auto text-muted-foreground">StudioVD {APP_VERSION}</span>
    </footer>
  )
}
