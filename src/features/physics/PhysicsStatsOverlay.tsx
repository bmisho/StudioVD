import { useSyncExternalStore } from "react"
import { useSessionStore } from "@/store/session/sessionStore"
import { physicsStats } from "./physicsStats"

const ms = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Dev builds only (PLAN 10.9): what test mode's physics costs a frame, bottom left. */
export function PhysicsStatsOverlay() {
  const testMode = useSessionStore((s) => s.testMode)
  const stats = useSyncExternalStore(physicsStats.subscribe, physicsStats.get)
  if (!testMode || stats.fps === 0) return null
  return (
    <p
      aria-hidden
      className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/90 px-1.5 py-0.5 font-mono text-xs text-muted-foreground tabular-nums"
    >
      physics {ms.format(stats.avgMs)} ms/frame (worst {ms.format(stats.worstMs)}) ·{" "}
      {Math.round(stats.fps)} fps
    </p>
  )
}
