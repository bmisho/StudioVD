// Test helper (not app code): mechanisms of parts at the identity pose, for DOF tests.
import type { MateType, Vec3 } from "@/core/schema"
import { assemblyGraph, type AssemblyGraph } from "../assemblyGraph"
import { anchor, mate, mateDoc, type part } from "./mateFixtures"

type TestPart = ReturnType<typeof part>

/** A mate between two parts at a shared world point and axis: it holds as built. */
export function joint(
  p: TestPart,
  q: TestPart,
  at: Vec3,
  axis: Vec3 = [0, 0, 1],
  type: MateType = "revolute"
) {
  const x: Vec3 = Math.abs(axis[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0]
  const [a, b] = [anchor(p, at, axis, x), anchor(q, at, axis, x)]
  return { anchors: [a, b], mate: mate(a, b, type) }
}

export function graphOf(parts: TestPart[], joints: ReturnType<typeof joint>[]) {
  const doc = mateDoc(
    parts,
    joints.flatMap((j) => j.anchors),
    joints.map((j) => j.mate)
  )
  return { doc, graph: assemblyGraph(doc) }
}

/** A part's degrees of freedom relative to the ground. */
export const dofOf = (g: AssemblyGraph, p: TestPart) => g.groups[g.groupOf.get(p.id) ?? -1]?.dof

/** The DOF of the mechanism holding the ground. */
export const groundedDof = (g: AssemblyGraph) => g.mechanisms.find((m) => m.grounded)?.dof
