import type { ComponentInstanceId, GroupId, PartId, SceneDocument } from "@/core/schema"
import type { SelectionRef } from "./selection"

/** The component a part belongs to, if any (its instance and that instance's group). */
export function componentOfPart(
  doc: Pick<SceneDocument, "parts" | "components">,
  id: PartId
): { instance: ComponentInstanceId; group: { kind: "group"; id: GroupId } } | null {
  const ref = Object.hasOwn(doc.parts, id) ? doc.parts[id]?.componentRef : undefined
  const c =
    ref && Object.hasOwn(doc.components, ref.instance) ? doc.components[ref.instance] : undefined
  return ref && c ? { instance: ref.instance, group: { kind: "group", id: c.groupId } } : null
}

/**
 * What a click on a part selects (PLAN 9.5): a library component as a whole (its group),
 * unless it is the component double-clicked into, whose parts are picked one by one.
 */
export function pickTarget<T extends SelectionRef>(
  doc: Pick<SceneDocument, "parts" | "components">,
  item: T | null,
  entered: ComponentInstanceId | null
): T | { kind: "group"; id: GroupId } | null {
  if (item?.kind !== "part") return item
  const owner = componentOfPart(doc, item.id as PartId)
  return owner && owner.instance !== entered ? owner.group : item
}
