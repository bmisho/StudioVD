import { useEffect } from "react"
import { startSimulation } from "./simulationService"

/** Runs the solver for the open document while the app is up (renders nothing). */
export function SimulationRunner() {
  useEffect(() => startSimulation(), [])
  return null
}
