import { ArrowUpCircle } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { componentOffers } from "@/core/library/catalog/offers"
import type { ComponentInstanceId } from "@/core/schema"
import { applyOffer } from "@/features/library/online/componentUpdates"
import { useDocumentStore } from "@/store/document/documentStore"
import { useCatalogStore } from "@/store/session/catalogStore"
import { useLibraryStore } from "@/store/session/libraryStore"

/**
 * A newer version of this component (PLAN 14.6), from what is installed or the refreshed
 * catalog: Update (same MAJOR, keeps mates to it) or Replace (a new MAJOR).
 */
export function ComponentUpdate({ id }: { id: ComponentInstanceId }) {
  const components = useDocumentStore((s) => s.doc.components)
  const defs = useDocumentStore((s) => s.doc.componentDefs)
  const installed = useLibraryStore((s) => s.installed)
  const index = useCatalogStore((s) => s.index)
  const offer = useMemo(
    () => componentOffers({ components, componentDefs: defs }, installed, index)[id],
    [components, defs, installed, index, id]
  )
  if (!offer) return null
  const update = offer.kind === "update"
  return (
    <div
      role="status"
      aria-label="Component update"
      className="flex flex-col gap-1 rounded-md border bg-surface p-2 text-xs"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <ArrowUpCircle className="size-3.5 text-primary" aria-hidden />
        {update ? `Version ${offer.to} is available` : `Version ${offer.to} (a new major version)`}
      </p>
      <p className="text-muted-foreground">
        {update
          ? "Update keeps its parts, anchors and the mates other parts have to it."
          : "Replace places the new version here; mates to the old one, its block and its bindings go."}
        {!offer.installed && " Its pack is downloaded first."}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="h-7 self-start text-xs"
        onClick={() => void applyOffer(id, offer)}
      >
        {update ? `Update to ${offer.to}` : `Replace with ${offer.to}`}
      </Button>
    </div>
  )
}
