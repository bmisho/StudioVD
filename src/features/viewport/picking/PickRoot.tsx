import { useThree, type ThreeEvent } from "@react-three/fiber"
import { useEffect, type ReactNode, type Ref } from "react"
import type { Group } from "three"
import {
  hoverTargetForMove,
  isPrimaryClick,
  selectionChangeForClick,
} from "@/core/scene/pickPolicy"
import { componentOfPart, pickTarget } from "@/core/scene/componentPick"
import { anchorPreview } from "@/features/assembly/anchorPreviewStore"
import { clickAnchor, previewAnchor } from "@/features/assembly/anchorTool"
import { anchorAt } from "@/features/assembly/glyphs"
import { pickMateAnchor } from "@/features/assembly/mateTool"
import { useDocumentStore } from "@/store/document/documentStore"
import {
  useSessionStore,
  type SelectionItem,
  type SessionStore,
} from "@/store/session/sessionStore"
import { useViewport } from "../ViewportContext"
import { assetCache } from "../parts/assetCache"
import { gizmoState } from "../gizmos/gizmoState"
import { applySelectionChange } from "./applySelectionChange"
import { viewportHover, type HoverStore } from "./hoverStore"
import { beginMoveDrag } from "./moveDrag"
import { pickRefOf } from "./pickTarget"
import { useHoverRefresh } from "./useHoverRefresh"

interface PickRootProps {
  /** ViewportContext.partsRoot: fit-all, clip planes and cursor-pivot picking use this group. */
  ref?: Ref<Group>
  children: ReactNode
  /** Injected in tests; the app uses the global stores. */
  session?: SessionStore
  hover?: HoverStore
}

/**
 * The single R3F event target for everything selectable. One handler group means one
 * `intersectObject(root, recursive)` per pointer move, the nearest hit decides, and
 * hover goes A -> B in one step (per-part handlers go A -> null -> B).
 */
export function PickRoot(props: PickRootProps) {
  const { ref, children, session = useSessionStore, hover = viewportHover } = props
  const { partGrab } = useViewport()
  const testMode = useSessionStore((s) => s.testMode)
  const placing = useSessionStore((s) => s.activeTool === "anchor")
  const mating = useSessionStore((s) => s.activeTool === "mate")
  const get = useThree((s) => s.get)
  // Leaving Place Anchor (Escape, another tool, test mode) drops what it was showing.
  useEffect(() => {
    if (!placing) anchorPreview.set(null)
  }, [placing])
  // Test mode: parts move under a still cursor, so the hover is also refreshed periodically;
  // and when an asset's mesh or snap features arrive (Place Anchor's snap appears unmoved).
  useHoverRefresh({ refreshOn: assetCache.subscribe, ...(testMode ? { periodicMs: 100 } : {}) })

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation() // nearest hit only
    // The Mate tool picks anchors, not parts: no part lights up under the cursor.
    hover.set(mating ? null : hoverTargetForMove(e.nativeEvent.buttons, pickRefOf(e.object)))
    if (placing) previewAnchor(e, get())
  }
  // R3F passes the NEW hits (priority, then distance order). If the top one is another part,
  // onPointerMove (right after) takes over; if it is empty space or a higher-priority layer
  // that stops propagation (drei view cube Hud), nothing else will clear the hover.
  const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
    const top = e.intersections[0]
    if (!top || pickRefOf(top.object) === null) {
      hover.set(null)
      anchorPreview.set(null)
    }
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (placing) return clickAnchor(e, get())
    if (mating) {
      const n = e.nativeEvent
      if (isPrimaryClick(n, e.delta)) pickMateAnchor(n.clientX, n.clientY)
      return
    }
    if (gizmoState.ownsClick()) return // the click belongs to a gizmo handle
    const n = e.nativeEvent
    // An anchor glyph drawn over the part wins (glyphs are picked by screen distance).
    const anchor = anchorAt(n.clientX, n.clientY)
    const raw: SelectionItem | null = anchor ? { kind: "anchor", id: anchor } : pickRefOf(e.object)
    // A library component is picked whole, unless it is the one double-clicked into.
    const doc = useDocumentStore.getState().doc
    const owner = raw?.kind === "part" ? componentOfPart(doc, raw.id) : null
    const state = session.getState()
    if (state.enteredComponent && owner?.instance !== state.enteredComponent)
      state.enterComponent(null)
    const target = pickTarget(doc, raw, session.getState().enteredComponent)
    const additive = n.ctrlKey || n.metaKey // same rule as SceneTreeRow
    applySelectionChange(
      session,
      selectionChangeForClick({ type: n.type, button: n.button, delta: e.delta, additive, target })
    )
  }
  // Double-click enters a component: its parts are then picked one by one (PLAN 9.5).
  const onDoubleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (placing || mating || testMode) return
    const raw = pickRefOf(e.object)
    const owner =
      raw?.kind === "part" ? componentOfPart(useDocumentStore.getState().doc, raw.id) : null
    if (!raw || !owner) return
    session.getState().enterComponent(owner.instance)
    session.getState().select([raw])
  }
  // Test mode only: a primary press on a part starts a physics drag (PLAN 3.9).
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const item = pickRefOf(e.object)
    const grab = partGrab.current
    if (!item || !grab || e.nativeEvent.button !== 0) return
    e.stopPropagation()
    grab(item, e)
  }

  // Design mode: a primary press on a part may become a drag that moves it (or its component).
  const onDesignPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const n = e.nativeEvent
    const state = session.getState()
    if (n.button !== 0 || n.ctrlKey || n.metaKey || state.activeTool !== "select") return
    // A press on an anchor glyph too: a click there still picks the anchor, a drag moves.
    if (gizmoState.ownsClick()) return
    const raw = pickRefOf(e.object)
    if (raw?.kind !== "part") return
    const target = pickTarget(useDocumentStore.getState().doc, raw, state.enteredComponent)
    if (!target) return
    beginMoveDrag(get(), target, {
      clientX: n.clientX,
      clientY: n.clientY,
      grab: e.point.toArray(),
    })
  }

  return (
    <group
      ref={ref}
      name="parts"
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={testMode ? onPointerDown : onDesignPointerDown}
    >
      {children}
    </group>
  )
}
