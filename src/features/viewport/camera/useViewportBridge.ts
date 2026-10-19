import { useEffect, useRef, type RefObject } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { Box3, type Group } from "three"
import { partAtPoint } from "../picking/partAtPoint"
import { captureThumbnail } from "../thumbnail/captureThumbnail"
import { viewportBridge } from "../viewportBridge"
import type { CameraRig } from "./createCameraRig"
import { fitAll, setViewDirection } from "./fitView"
import { visiblePartsBox } from "./sceneBounds"

const box = new Box3()

/** Registers fit-all, standard views and thumbnails with the command bridge; fits on mount. */
export function useViewportBridge(rig: CameraRig, partsRoot: RefObject<Group | null>): void {
  const get = useThree((s) => s.get)
  const invalidate = useThree((s) => s.invalidate)
  const pendingFit = useRef<boolean | null>(null) // null: none; else `animate`

  useEffect(() => {
    const fit = (animate: boolean) => {
      void fitAll(rig, visiblePartsBox(partsRoot.current, box), get().size, animate)
      invalidate() // immediate moves dispatch no camera-controls event
    }
    fit(false)
    return viewportBridge.attach({
      fitAll: fit,
      fitAllNextFrame: (animate) => {
        pendingFit.current = animate
        invalidate()
      },
      setView: (direction, animate) => {
        void setViewDirection(rig, direction, animate)
        invalidate()
      },
      captureThumbnail: () => captureThumbnail(get()),
      partAt: (x, y) => partAtPoint(get(), partsRoot.current, x, y),
    })
  }, [rig, partsRoot, get, invalidate])

  // Runs before the camera update (-1), after React committed the change that asked for it.
  useFrame(() => {
    const animate = pendingFit.current
    if (animate === null) return
    pendingFit.current = null
    void fitAll(rig, visiblePartsBox(partsRoot.current, box), get().size, animate)
    invalidate()
  }, -2)
}
