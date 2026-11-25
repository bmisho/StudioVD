import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react"
import { Canvas } from "@react-three/fiber"
import type { Group } from "three"
import { useSessionStore } from "@/store/session/sessionStore"
import { CameraRigController } from "./camera/CameraRigController"
import { AnchorToolHint } from "@/features/assembly/AnchorToolHint"
import { GlyphScaler } from "@/features/assembly/GlyphScaler"
import { MatePreview } from "@/features/assembly/MatePreview"
import { InsertionGhost } from "@/features/library/InsertionGhost"
import { MateToolHint } from "@/features/assembly/MateToolHint"
import { InterferencePanel } from "@/features/physics/InterferencePanel"
import { PhysicsStatsOverlay } from "@/features/physics/PhysicsStatsOverlay"
import { PartTransformGizmo } from "./gizmos/PartTransformGizmo"
import { createCameraRig } from "./camera/createCameraRig"
import { MaterialSync } from "./materials/MaterialSync"
import { PartsLayer } from "./parts/PartsLayer"
import { createViewportMissHandler } from "./picking/viewportMiss"
import { ContextLossGuard } from "./renderer/ContextLossGuard"
import { DprWatcher } from "./renderer/DprWatcher"
import { DPR, GL_PARAMS, frameloopFor } from "./renderer/rendererConfig"
import { SceneBackground } from "./renderer/SceneBackground"
import { SceneDressing } from "./scene/SceneDressing"
import { ViewportProbe } from "./testing/ViewportProbe"
import { ViewportContext, type PartGrabHandler } from "./ViewportContext"
import { BoxSelect } from "./picking/BoxSelect"
import { BoxSelectOverlay } from "./picking/BoxSelectOverlay"
import { ViewportStatusOverlay } from "./ViewportStatusOverlay"

// Rapier (WASM inlined in its JS) loads on the first entry into test mode, not at startup.
const PhysicsLayer = lazy(() =>
  import("@/features/physics/PhysicsLayer").then((m) => ({ default: m.PhysicsLayer }))
)

/**
 * The 3D view. Mounted once by CenterSplit and never remounted by layout changes (a
 * remount would destroy the WebGL context). While its pane is 0 px R3F creates nothing; the
 * CSS gradient behind the canvas covers that and the time before the first frame.
 */
export function Viewport3D() {
  const testMode = useSessionStore((s) => s.testMode)
  const [rig] = useState(createCameraRig)
  const partsRoot = useRef<Group>(null)
  const partGrab = useRef<PartGrabHandler>(null)
  const context = useMemo(() => ({ rig, partsRoot, partGrab }), [rig])
  const onPointerMissed = useMemo(() => createViewportMissHandler(useSessionStore), [])
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
        raycaster={{ firstHitOnly: true }}
        onPointerMissed={onPointerMissed}
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
          <MaterialSync />
          <PartsLayer />
          <PartTransformGizmo />
          <MatePreview />
          <InsertionGhost />
          <GlyphScaler />
          <BoxSelect />
          {testMode && (
            <Suspense fallback={null}>
              <PhysicsLayer />
            </Suspense>
          )}
          {(import.meta.env.DEV || import.meta.env.VITE_E2E_PROBE === "1") && <ViewportProbe />}
        </ViewportContext>
      </Canvas>
      <ViewportStatusOverlay />
      <AnchorToolHint />
      <BoxSelectOverlay />
      <MateToolHint />
      <InterferencePanel />
      {import.meta.env.DEV && <PhysicsStatsOverlay />}
    </div>
  )
}
