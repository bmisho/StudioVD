import { Activity, AlertTriangle, Info } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { NodeId } from "@/core/schema"
import { quantity } from "@/core/sim/format"
import { cn } from "@/lib/utils"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { useSimulationStore } from "@/store/session/simulationStore"

const STATUS = {
  idle: "Nothing to solve yet",
  solving: "Solving…",
  solved: "Solved",
  warning: "Solved, with warnings",
  error: "Errors",
} as const

const TONE = { error: "text-destructive", warning: "text-warning", info: "text-primary" } as const

/** The last solve at a glance (PLAN 12.9): totals, findings, the power of each block. */
export function ResultsButton() {
  const status = useSessionStore((s) => s.simStatus)
  const result = useSimulationStore((s) => s.result)
  const nodes = useDocumentStore((s) => s.doc.schematic.nodes)
  const select = useSessionStore((s) => s.select)
  const label = (id: string) => nodes[id as NodeId]?.label ?? "?"
  const power = useMemo(
    () =>
      Object.entries(result?.power ?? {})
        .filter(([, p]) => Math.abs(p) > 1e-9)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 12),
    [result]
  )
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "h-7 gap-1 bg-background px-2 text-xs",
            status === "error" && "text-destructive",
            status === "warning" && "text-warning"
          )}
        >
          {status === "error" || status === "warning" ? (
            <AlertTriangle className="size-3.5" aria-hidden />
          ) : (
            <Activity className="size-3.5" aria-hidden />
          )}
          Results
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3 text-xs">
        <p className="font-medium" role="status">
          {STATUS[status]}
        </p>
        {result && (
          <p className="mt-1 text-muted-foreground tabular-nums">
            Supplied {quantity(result.supplied, "W")} · used {quantity(result.dissipated, "W")}
          </p>
        )}
        {result && result.diagnostics.length > 0 && (
          <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto" aria-label="Findings">
            {result.diagnostics.map((d, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="flex w-full gap-1.5 rounded-sm p-1 text-left hover:bg-accent-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => select(d.nodes.map((id) => ({ kind: "node" as const, id })))}
                >
                  {d.severity === "info" ? (
                    <Info className={cn("mt-px size-3.5 shrink-0", TONE.info)} aria-hidden />
                  ) : (
                    <AlertTriangle
                      className={cn("mt-px size-3.5 shrink-0", TONE[d.severity])}
                      aria-hidden
                    />
                  )}
                  <span className="text-foreground">{d.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {power.length > 0 && (
          // Sources and consumers in their own columns: the solver's sign (power taken, so a
          // battery's is negative) read as an error (0.2.2 first-run report).
          <table className="mt-2 w-full tabular-nums" aria-label="Power by block">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-normal">Block</th>
                <th className="text-right font-normal">Supplies</th>
                <th className="text-right font-normal">Uses</th>
              </tr>
            </thead>
            <tbody>
              {power.map(([id, p]) => (
                <tr key={id}>
                  <td className="truncate">{label(id)}</td>
                  <td className="text-right">{p < 0 ? quantity(-p, "W") : ""}</td>
                  <td className="text-right">{p > 0 ? quantity(p, "W") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PopoverContent>
    </Popover>
  )
}
