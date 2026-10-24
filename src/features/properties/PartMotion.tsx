import type { PartId } from "@/core/schema"
import { useAssemblyGraph } from "@/features/assembly/useAssemblyGraph"
import { PropertyField } from "./PropertyField"

/**
 * How a part can move, from the assembly graph (PLAN 8.4): grounded, fixed to the ground
 * through mates, its degrees of freedom relative to the ground, floating with other parts,
 * or free (no mates).
 */
export function PartMotion({ id }: { id: PartId }) {
  const graph = useAssemblyGraph()
  const group = graph.groups[graph.groupOf.get(id) ?? -1]
  const mechanism = group && graph.mechanisms[group.mechanism]
  if (!group || !mechanism) return null
  const mated = group.parts.length > 1 || mechanism.joints.length > 0
  let motion: string
  if (group.grounded)
    motion = group.parts.length > 1 ? "Grounded (with the parts fixed to it)" : "Grounded"
  else if (!mated) motion = "Free (no mates)"
  else if (!mechanism.grounded)
    motion = `Floating with its mates (${mechanism.dof ?? "?"} DOF in all)`
  else if (group.dof === 0) motion = "Fixed to the ground through mates"
  else
    motion =
      group.dof === null ? "Moves (DOF not counted)" : `${group.dof} DOF relative to the ground`
  return (
    <div className="mt-2">
      <PropertyField label="Motion" value={motion} />
    </div>
  )
}
