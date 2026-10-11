import { useCallback, useSyncExternalStore } from "react"
import { sameTarget, viewportHover, type HoverTarget, type HoverStore } from "./hoverStore"

/** True while `target` is pre-highlighted. Only components whose answer flips re-render. */
export function useIsHovered(target: HoverTarget, store: HoverStore = viewportHover): boolean {
  const { kind, id } = target
  const snapshot = useCallback(() => sameTarget(store.get(), { kind, id }), [store, kind, id])
  return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}
