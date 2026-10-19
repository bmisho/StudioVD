import { useMemo } from "react"
import type { Material as ThreeMaterial } from "three"
import type { AssetSlot } from "@/core/geometry/slots"
import type { Part } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import type { DisplayMode } from "@/store/session/sessionStore"
import { partMaterials } from "../materials/partMaterials"

/**
 * A part's materials for the display mode. Re-resolved only when the part's assignments, its
 * loaded slots or the mode change: edits to a material's values reach the cached three.js
 * material in place (MaterialSync), so a slider scrub re-renders no parts. Materials are read
 * from the store, not subscribed to: one appears or goes only together with a change to the
 * parts that use it (assign, delete, undo).
 */
export function usePartMaterial(
  part: Pick<Part, "materialId" | "materialSlots">,
  slots: readonly AssetSlot[] | null,
  mode: DisplayMode
): ThreeMaterial | ThreeMaterial[] {
  const { materialId, materialSlots } = part
  return useMemo(
    () =>
      partMaterials(
        { materialId, materialSlots },
        slots,
        mode === "xray" ? "xray" : "shaded",
        useDocumentStore.getState().doc
      ),
    [materialId, materialSlots, slots, mode]
  )
}
