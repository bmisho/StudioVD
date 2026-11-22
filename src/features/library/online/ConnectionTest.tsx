import { CircleCheck, CircleX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCatalogStore } from "@/store/session/catalogStore"
import { networkController } from "./catalogService"

/** Test connection (PLAN 4.7): each catalog host, and precisely why one cannot be reached. */
export function ConnectionTest() {
  const checks = useCatalogStore((s) => s.checks)
  const testing = useCatalogStore((s) => s.testing)
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        aria-disabled={testing}
        onClick={() => !testing && void networkController.test()}
      >
        {testing ? "Testing…" : "Test connection"}
      </Button>
      {checks && (
        <ul aria-label="Connection test" className="flex flex-col gap-1 text-xs">
          {checks.map((c, i) => (
            <li key={`${c.host}-${i}`} className="flex gap-1.5">
              {c.ok ? (
                <CircleCheck
                  className="mt-0.5 size-3.5 shrink-0 text-success"
                  aria-label="Reached"
                />
              ) : (
                <CircleX
                  className="mt-0.5 size-3.5 shrink-0 text-destructive"
                  aria-label="Failed"
                />
              )}
              <span>{c.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
