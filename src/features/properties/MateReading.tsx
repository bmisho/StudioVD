import { useSyncExternalStore } from "react"
import type { Mate } from "@/core/schema"
import { radToDeg } from "@/core/units"
import { jointReadings } from "@/features/physics/jointReadings"
import { useSessionStore } from "@/store/session/sessionStore"
import { PropertyField } from "./PropertyField"

const fixed = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** The mate's live coordinate while test mode runs (PLAN 10.4), refreshed ten times a second. */
export function MateReading({ mate }: { mate: Pick<Mate, "id" | "type"> }) {
  const testMode = useSessionStore((s) => s.testMode)
  useSyncExternalStore(jointReadings.subscribe, jointReadings.version)
  const value = jointReadings.get(mate.id)
  if (!testMode || value === undefined) return null
  if (mate.type !== "revolute" && mate.type !== "prismatic") return null
  const text =
    mate.type === "revolute" ? `${fixed.format(radToDeg(value))}°` : `${fixed.format(value)} mm`
  return <PropertyField label="Now (test mode)" value={text} />
}
