import { useSyncExternalStore } from "react"
import { useDocumentStore } from "@/store/document/documentStore"
import { useAnchorTarget } from "@/store/session/anchorTargetStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { anchorPreview } from "./anchorPreviewStore"

/** What the clicks do: place anchors, lay a cable's waypoints, move one anchor, draw cables. */
function useTask(): { title: string; finish: string } {
  const target = useAnchorTarget((s) => s.target)
  const name = useDocumentStore((s) => {
    if (target?.kind === "route")
      return Object.hasOwn(s.doc.connectors, target.cable)
        ? s.doc.connectors[target.cable]?.name
        : ""
    if (target?.kind === "move") {
      const a = Object.hasOwn(s.doc.anchors, target.anchor) ? s.doc.anchors[target.anchor] : null
      const part = a && Object.hasOwn(s.doc.parts, a.partId) ? s.doc.parts[a.partId] : null
      return `${a?.name ?? "anchor"} on ${part?.name ?? "its part"}`
    }
    return ""
  })
  if (target?.kind === "cable")
    return target.route.length === 0
      ? { title: "Cable", finish: "Click where it starts: a lug, a pad or any surface" }
      : { title: "Cable", finish: "Click zip ties on the way, then where it ends · Esc to stop" }
  if (target?.kind === "route")
    return {
      title: `Route ${name}`,
      finish: "Click surfaces in order to add waypoints, Esc to finish",
    }
  if (target?.kind === "move")
    return { title: `Move ${name}`, finish: "Click where it goes on that part, Esc to cancel" }
  return { title: "Place Anchor", finish: "Click to place (Shift+click: more), Esc to cancel" }
}

/**
 * What Place Anchor is doing, over the top of the 3D view (PLAN 7.2): what the cursor snaps to
 * now, and how to finish. The tool itself is announced once; the live snap is visual only.
 */
export function AnchorToolHint() {
  const placing = useSessionStore((s) => s.activeTool === "anchor")
  const preview = useSyncExternalStore(anchorPreview.subscribe, anchorPreview.get)
  const task = useTask()
  if (!placing) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
      <p
        role="status"
        className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground shadow-sm"
      >
        <span className="font-medium">{task.title}</span>
        <span aria-hidden="true" className="tabular-nums">
          {" · "}
          {preview ? preview.candidate.hint : "Point at a face, edge, corner or hole"}
        </span>
        <span className="text-muted-foreground"> · {task.finish}</span>
      </p>
    </div>
  )
}
