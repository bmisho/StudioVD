import { useEffect } from "react"
import { useThree } from "@react-three/fiber"

/**
 * Requests a frame when this component's objects go away: on unmount, and when `key` changes
 * (the children it renders depend on it). R3F requests one when objects are added or their
 * props change, but not when they are removed, so in the demand frameloop they would stay on
 * screen until something else redraws.
 */
export function useRedrawOnRemoval(key: unknown = null): void {
  const get = useThree((s) => s.get)
  useEffect(() => () => get().invalidate(), [get, key])
}
