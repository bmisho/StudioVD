import { useFrame } from "@react-three/fiber"
import { useRapier } from "@react-three/rapier"
import { useRef } from "react"
import { toastNotifier } from "@/lib/notify"
import { useSessionStore } from "@/store/session/sessionStore"
import { stepFrame } from "./frameSteps"
import { physicsStats } from "./physicsStats"

/**
 * Steps test mode's world from the render loop (<Physics paused> leaves stepping to this),
 * at most MAX_STEPS_PER_FRAME a frame (`stepFrame`). A step that throws (a Rapier trap) ends
 * test mode with a message instead of freezing the window or stepping a broken world again.
 */
export function PhysicsStepper() {
  const { step } = useRapier()
  const failed = useRef(false)
  useFrame((_, delta) => {
    if (failed.current) return
    const start = performance.now()
    const error = stepFrame(step, delta)
    physicsStats.record(performance.now() - start)
    if (error === null) return
    failed.current = true
    console.error("Physics step failed", error)
    if (useSessionStore.getState().testMode) useSessionStore.getState().toggleTestMode()
    toastNotifier.error(
      "Test mode stopped",
      "The physics engine failed on this assembly. The parts are back at their design pose."
    )
  })
  return null
}
