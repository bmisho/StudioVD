import { useSyncExternalStore } from "react"
import { useSessionStore } from "@/store/session/sessionStore"
import { anchorPreview } from "./anchorPreview"

/**
 * What Place Anchor is doing, over the top of the 3D view (PLAN 7.2): what the cursor snaps to
 * now, and how to finish. The tool itself is announced once; the live snap is visual only.
 */
export function AnchorToolHint() {
  const placing = useSessionStore((s) => s.activeTool === "anchor")
  const preview = useSyncExternalStore(anchorPreview.subscribe, anchorPreview.get)
  if (!placing) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
      <p
        role="status"
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground shadow-sm"
      >
        <span className="font-medium">Place Anchor</span>
        <span aria-hidden="true" className="tabular-nums">
          {" · "}
          {preview ? preview.candidate.hint : "Point at a face, edge, corner or hole"}
        </span>
        <span className="text-muted-foreground"> · Click to place, Esc to finish</span>
      </p>
    </div>
  )
}
