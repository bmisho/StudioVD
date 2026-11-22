import { useEffect } from "react"
import { catalogController } from "./catalogService"

/** The opt-in weekly catalog check (PLAN 4.7): off by default; never more than once a week. */
export function useWeeklyCatalogCheck(): void {
  useEffect(() => void catalogController.weeklyCheck(), [])
}
