import { Physics } from "@react-three/rapier"
import { Suspense, useMemo } from "react"
import { physicsModelFromDocument } from "@/core/physics/physicsModel"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import {
  CONTACT_NATURAL_FREQUENCY,
  LENGTH_UNIT,
  PREDICTION_DISTANCE,
  SOLVER_ITERATIONS,
  TIME_STEP_S,
} from "./physicsConfig"
import { PhysicsScene } from "./PhysicsScene"

const runIds = new WeakMap<object, number>()
let nextRunId = 0
/** A stable number per model object (immer keeps it while the relevant document is unchanged). */
const runIdOf = (model: object) => {
  let id = runIds.get(model)
  if (id === undefined) runIds.set(model, (id = ++nextRunId))
  return id
}

/**
 * Test mode's physics (PLAN 3.7, 3.10). Mounted only while test mode is on, so design mode
 * has no world and no stepping at all (Rapier's WASM loads on first use). The world restarts
 * from the design pose on "Reset to Design Pose" and whenever the simulated part of the
 * document changes (key = run x model).
 */
export function PhysicsLayer() {
  const testMode = useSessionStore((s) => s.testMode)
  const testRun = useSessionStore((s) => s.testRun)
  const parts = useDocumentStore((s) => s.doc.parts)
  const assets = useDocumentStore((s) => s.doc.assets)
  const materials = useDocumentStore((s) => s.doc.materials)
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const mates = useDocumentStore((s) => s.doc.mates)
  const model = useMemo(
    () => physicsModelFromDocument({ parts, assets, materials, anchors, mates }),
    [parts, assets, materials, anchors, mates]
  )
  if (!testMode) return null

  return (
    <Suspense fallback={null}>
      <Physics
        key={`${testRun}:${runIdOf(model)}`}
        gravity={[0, 0, 0]}
        timeStep={TIME_STEP_S}
        lengthUnit={LENGTH_UNIT}
        predictionDistance={PREDICTION_DISTANCE}
        contactNaturalFrequency={CONTACT_NATURAL_FREQUENCY}
        numSolverIterations={SOLVER_ITERATIONS}
        colliders={false}
        interpolate={false}
      >
        <PhysicsScene model={model} />
      </Physics>
    </Suspense>
  )
}
