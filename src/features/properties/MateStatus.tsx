import { Button } from "@/components/ui/button"
import { ISSUE_TEXT, REFUSAL_TEXT } from "@/core/assembly/mateNames"
import type { SnapRefusal } from "@/core/assembly/mateSnap"
import type { Mate, PartId } from "@/core/schema"
import { useAssemblyGraph } from "@/features/assembly/useAssemblyGraph"

/**
 * What the assembly graph says about a mate (PLAN 8.4): its issues, the degrees of freedom
 * of the mechanism it belongs to, and Snap again when its parts no longer stand where it puts
 * them. `refusal`: why the last change or snap could not move the parts.
 */
export function MateStatus({
  mate,
  partId,
  refusal,
  onResnap,
}: {
  mate: Mate
  partId: PartId | undefined
  refusal: SnapRefusal | null
  onResnap: () => void
}) {
  const graph = useAssemblyGraph()
  const issues = graph.issues.get(mate.id) ?? []
  const group = partId ? graph.groups[graph.groupOf.get(partId) ?? -1] : undefined
  const mechanism = group && graph.mechanisms[group.mechanism]
  let dof = ""
  if (mechanism && !issues.includes("suppressed"))
    dof =
      mechanism.dof === null
        ? "Mechanism: too large to count its DOF"
        : mechanism.grounded
          ? `Mechanism: ${mechanism.dof} DOF`
          : `Floating mechanism: ${mechanism.dof} DOF (with its own 6)`
  return (
    <div className="flex flex-col gap-1">
      {dof && <p className="text-xs text-muted-foreground tabular-nums">{dof}</p>}
      {issues.map((i) => (
        <p
          key={i}
          className={
            i === "unsatisfied" || i === "bothGrounded"
              ? "text-xs text-warning"
              : "text-xs text-muted-foreground"
          }
        >
          {ISSUE_TEXT[i]}
        </p>
      ))}
      {refusal && (
        <p role="status" className="text-xs text-destructive">
          {REFUSAL_TEXT[refusal]}
        </p>
      )}
      {issues.includes("unsatisfied") && !issues.includes("suppressed") && (
        <Button variant="outline" size="sm" className="h-7 self-start text-xs" onClick={onResnap}>
          Snap again
        </Button>
      )}
    </div>
  )
}
