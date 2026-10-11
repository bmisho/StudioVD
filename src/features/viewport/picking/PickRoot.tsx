import type { ThreeEvent } from "@react-three/fiber"
import type { ReactNode, Ref } from "react"
import type { Group } from "three"
import { hoverTargetForMove, selectionChangeForClick } from "@/core/scene/pickPolicy"
import { useSessionStore, type SessionStore } from "@/store/session/sessionStore"
import { useViewport } from "../ViewportContext"
import { applySelectionChange } from "./applySelectionChange"
import { viewportHover, type HoverStore } from "./hoverStore"
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
  // Test mode: parts move under a still cursor, so the hover is also refreshed periodically.
  useHoverRefresh(testMode ? { periodicMs: 100 } : {})

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation() // nearest hit only
    hover.set(hoverTargetForMove(e.nativeEvent.buttons, pickRefOf(e.object)))
  }
  // R3F passes the NEW hits (priority, then distance order). If the top one is another part,
  // onPointerMove (right after) takes over; if it is empty space or a higher-priority layer
  // that stops propagation (drei view cube Hud), nothing else will clear the hover.
  const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
    const top = e.intersections[0]
    if (!top || pickRefOf(top.object) === null) hover.set(null)
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const n = e.nativeEvent
    const target = pickRefOf(e.object)
    const additive = n.ctrlKey || n.metaKey // same rule as SceneTreeRow
    applySelectionChange(
      session,
      selectionChangeForClick({ type: n.type, button: n.button, delta: e.delta, additive, target })
    )
  }
  // Test mode only: a primary press on a part starts a physics drag (PLAN 3.9).
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const item = pickRefOf(e.object)
    const grab = partGrab.current
    if (!item || !grab || e.nativeEvent.button !== 0) return
    e.stopPropagation()
    grab(item, e)
  }

  return (
    <group
      ref={ref}
      name="parts"
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onPointerDown={testMode ? onPointerDown : undefined}
    >
      {children}
    </group>
  )
}
