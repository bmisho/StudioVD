import { AlertTriangle, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { readout } from "@/features/simulation/readouts"
import { useSimulationStore } from "@/store/session/simulationStore"

const BADGE = {
  error: "bg-destructive",
  warning: "bg-warning",
  info: "bg-primary",
} as const

/** What the last solve says about a block (PLAN 12.9): its reading, and a badge if any. */
export function BlockStatus({ node, simModel }: { node: string; simModel: string | undefined }) {
  const issue = useSimulationStore((s) => s.issues[node])
  const text = useSimulationStore((s) => readout(s.result, node, simModel))
  const messages = useSimulationStore(
    (s) =>
      s.result?.diagnostics
        .filter((d) => d.nodes.includes(node as never))
        .map((d) => d.message)
        .join("\n") ?? ""
  )
  const Icon = issue === "info" ? Info : AlertTriangle
  return (
    <>
      {text !== null && (
        <span
          className="pointer-events-none absolute bottom-1.5 left-1/2 max-w-[60%] -translate-x-1/2 truncate rounded-sm bg-accent px-1.5 text-xs text-accent-foreground tabular-nums"
          data-testid="block-readout"
        >
          {text}
        </span>
      )}
      {issue && (
        <span
          role="img"
          aria-label={messages}
          title={messages}
          className={cn(
            "absolute -top-2 -right-2 flex size-4 items-center justify-center rounded-full text-white",
            BADGE[issue]
          )}
        >
          <Icon className="size-3" aria-hidden />
        </span>
      )}
    </>
  )
}
