import { createContext, useContext, type RefObject } from "react"
import type { Group } from "three"
import type { CameraRig } from "./camera/createCameraRig"

/** Shared by everything inside the viewport canvas. */
export interface ViewportContextValue {
  rig: CameraRig
  /** Group holding the parts: the only things fit-all, clip planes and picking look at. */
  partsRoot: RefObject<Group | null>
}

export const ViewportContext = createContext<ViewportContextValue | null>(null)

export function useViewport(): ViewportContextValue {
  const value = useContext(ViewportContext)
  if (!value) throw new Error("useViewport() must be used inside the viewport canvas")
  return value
}
