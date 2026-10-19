import { Button } from "@/components/ui/button"
import type { MaterialId, Part, PartId, SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"

const uses = (part: Part, id: MaterialId) =>
  part.materialId === id || (part.materialSlots?.some((s) => s.materialId === id) ?? false)

/** Parts using the material, as their material or on a slot; `except` are left out. */
const usersOf = (doc: SceneDocument, id: MaterialId, except: readonly PartId[] = []) =>
  Object.values(doc.parts).filter((p) => uses(p, id) && !except.includes(p.id)).length

const plural = (n: number) => (n === 1 ? "1 part" : `${n} parts`)

/**
 * How many parts share the material, and what to do with it: "Make unique" gives `partIds`
 * their own copy (offered while they use it and other parts do too), "Delete material" sends
 * its parts and slots back to their imported colours.
 */
export function MaterialActionsRow({
  materialId,
  partIds,
}: {
  materialId: MaterialId
  partIds: readonly PartId[]
}) {
  const used = useDocumentStore((s) => usersOf(s.doc, materialId))
  const others = useDocumentStore((s) => usersOf(s.doc, materialId, partIds))
  const duplicateMaterial = useDocumentStore((s) => s.duplicateMaterial)
  const deleteMaterial = useDocumentStore((s) => s.deleteMaterial)

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground tabular-nums">
        {used === 0 ? "Not used by any part" : `Used by ${plural(used)}`}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {others > 0 && used > others && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            title={
              partIds.length === 1
                ? "Give the selected part its own copy"
                : "Give the selected parts their own copy"
            }
            onClick={() => duplicateMaterial(materialId, partIds)}
          >
            Make unique
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          // sky-50 keeps red text above 4.5:1 on hover (accent would not).
          className="h-7 text-xs text-destructive hover:bg-accent-subtle hover:text-destructive"
          onClick={() => deleteMaterial(materialId)}
        >
          Delete material
        </Button>
      </div>
    </div>
  )
}
