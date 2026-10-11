import { Suspense, useCallback, useMemo, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import type { Group } from "three"
import { useSessionStore } from "@/store/session/sessionStore"
import { CameraRigController } from "./camera/CameraRigController"
import { createCameraRig } from "./camera/createCameraRig"
import { ContextLossGuard } from "./renderer/ContextLossGuard"
import { DprWatcher } from "./renderer/DprWatcher"
import { DPR, GL_PARAMS, frameloopFor } from "./renderer/rendererConfig"
import { SceneBackground } from "./renderer/SceneBackground"
import { SceneDressing } from "./scene/SceneDressing"
import { ViewportProbe } from "./testing/ViewportProbe"
import { ViewportContext } from "./ViewportContext"
import { ViewportStatusOverlay } from "./ViewportStatusOverlay"

/**
 * The 3D view. Mounted once by CenterSplit and never remounted by layout changes (a
 * remount would destroy the WebGL context). While its pane is 0 px R3F creates nothing; the
 * CSS gradient behind the canvas covers that and the time before the first frame.
 */
export function Viewport3D() {
  const testMode = useSessionStore((s) => s.testMode)
  const [rig] = useState(createCameraRig)
  const partsRoot = useRef<Group>(null)
  const context = useMemo(() => ({ rig, partsRoot }), [rig])
  const [failed, setFailed] = useState(false)
  const giveUp = useCallback(() => setFailed(true), [])
  // The context never came back: the panel boundary's "Reload panel" mounts a fresh one.
  if (failed) throw new Error("The 3D view lost its graphics context and could not restore it.")

  return (
    <div className="relative h-full bg-linear-to-b from-viewport-top to-viewport-bottom">
      <Canvas
        data-testid="viewport-canvas"
        camera={rig.persp}
        gl={GL_PARAMS}
        dpr={DPR}
        frameloop={frameloopFor(testMode)}
        fallback={<p className="p-4 text-xs text-muted-foreground">The 3D view needs WebGL 2.</p>}
      >
        <ViewportContext value={context}>
          <SceneBackground />
          <ContextLossGuard onGiveUp={giveUp} />
          <DprWatcher />
          <CameraRigController />
          {/* Each suspending subtree needs its own boundary inside the Canvas, or the whole
              app shell stops committing updates until it resolves. */}
          <Suspense fallback={null}>
            <SceneDressing />
          </Suspense>
          <group ref={partsRoot} name="parts" />
          {import.meta.env.DEV && <ViewportProbe />}
        </ViewportContext>
      </Canvas>
      <ViewportStatusOverlay />
    </div>
  )
}
