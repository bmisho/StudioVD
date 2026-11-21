import type { BufferGeometry } from "three"
import { useSimVisualStore } from "@/features/bindings/simVisualStore"
import { useRedrawOnRemoval } from "../renderer/useRedrawOnRemoval"
import { SimMark } from "./SimMark"

/** Arrows, labels and ghosts the last solve puts on this part (PLAN 13.1). */
export function PartSimMarks({ partId, geometry }: { partId: string; geometry: BufferGeometry }) {
  const marks = useSimVisualStore((s) => s.marks[partId])
  useRedrawOnRemoval(marks?.length ?? 0)
  return (
    <>
      {marks?.map((m) => (
        <SimMark key={m.key} mark={m} geometry={geometry} />
      ))}
    </>
  )
}
