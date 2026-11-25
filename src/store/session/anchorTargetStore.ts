import { create } from "zustand"
import type { AnchorId, ConnectorId } from "@/core/schema"
import { useSessionStore } from "./sessionStore"

/**
 * What Place Anchor's clicks are for, besides new anchors (session state): laying a cable's
 * waypoints in the order clicked, or putting one existing anchor somewhere else on its part.
 */
export type AnchorTarget =
  { kind: "route"; cable: ConnectorId } | { kind: "move"; anchor: AnchorId } | null

export const useAnchorTarget = create<{ target: AnchorTarget }>()(() => ({ target: null }))

let stop: (() => void) | null = null

/** Ends what the tool was doing for a target (the tool itself may stay on). */
export function endAnchorTarget(): void {
  stop?.()
  stop = null
  useAnchorTarget.setState({ target: null })
}

/**
 * Turns Place Anchor on for `target`. Leaving the tool (Escape, another tool, test mode, a
 * new document) ends it, so a later Place Anchor places plain anchors again.
 */
export function startAnchorTarget(target: NonNullable<AnchorTarget>): void {
  endAnchorTarget()
  useAnchorTarget.setState({ target })
  useSessionStore.getState().setTool("anchor")
  stop = useSessionStore.subscribe((s) => {
    if (s.activeTool !== "anchor") endAnchorTarget()
  })
}
