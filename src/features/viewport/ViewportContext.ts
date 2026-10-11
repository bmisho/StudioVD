import { createContext, useContext, type RefObject } from "react"
import type { ThreeEvent } from "@react-three/fiber"
import type { Group } from "three"
import type { SelectionItem } from "@/store/session/sessionStore"
import type { CameraRig } from "./camera/createCameraRig"

/** Starts a test-mode drag from a primary-button press on a part (PLAN 3.9). */
export type PartGrabHandler = (item: SelectionItem, event: ThreeEvent<PointerEvent>) => void

/** Shared by everything inside the viewport canvas. */
export interface ViewportContextValue {
  rig: CameraRig
  /** Group holding the parts: the only things fit-all, clip planes and picking look at. */
  partsRoot: RefObject<Group | null>
  /** Set by the physics layer while test mode runs; null in design mode. */
  partGrab: RefObject<PartGrabHandler | null>
}

export const ViewportContext = createContext<ViewportContextValue | null>(null)

export function useViewport(): ViewportContextValue {
  const value = useContext(ViewportContext)
  if (!value) throw new Error("useViewport() must be used inside the viewport canvas")
  return value
}
