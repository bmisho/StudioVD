import type { Material, MaterialId, Part, Vec3 } from "@/core/schema"

/** What one material slot of a part is drawn with. */
export type SlotLook =
  | { kind: "material"; materialId: MaterialId }
  | { kind: "source"; color: Vec3 }
  | { kind: "default" }

/** A slot as the stored asset has it: its name (multi-slot assets only) and source colour. */
export interface AssetSlotInfo {
  name: string | null
  color: Vec3 | null
}

/**
 * The look of every slot, in slot order (PLAN 6.1): the part's override for that slot, else
 * the part's material, else the slot's source colour, else the default. A reference to a
 * material that does not exist falls through rather than throwing, so a document mid-edit
 * still draws. Before its asset is loaded a part has no slot list: pass one unnamed slot.
 */
export function slotLooks(
  part: Pick<Part, "materialId" | "materialSlots">,
  slots: readonly AssetSlotInfo[],
  materials: Readonly<Record<string, Material>>
): SlotLook[] {
  const exists = (id: MaterialId | null | undefined): id is MaterialId =>
    id !== null && id !== undefined && Object.hasOwn(materials, id)
  return slots.map((slot): SlotLook => {
    const override =
      slot.name === null ? undefined : part.materialSlots?.find((s) => s.slot === slot.name)
    if (exists(override?.materialId)) return { kind: "material", materialId: override.materialId }
    if (exists(part.materialId)) return { kind: "material", materialId: part.materialId }
    return slot.color ? { kind: "source", color: slot.color } : { kind: "default" }
  })
}

/** A stable key per look, for caching the three.js material that draws it. */
export const lookKey = (look: SlotLook): string =>
  look.kind === "material"
    ? `m:${look.materialId}`
    : look.kind === "source"
      ? `s:${look.color.join(",")}`
      : "d"
