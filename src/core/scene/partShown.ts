import type { Part } from "@/core/schema"

/**
 * Whether the 3D view draws (mounts) a part: visible, and in View › Isolate's set while one is
 * on. Hidden parts are not mounted at all: three raycasts invisible objects.
 */
export const partShown = (
  part: Pick<Part, "id" | "visible">,
  isolated: ReadonlySet<string> | null
): boolean => part.visible && (!isolated || isolated.has(part.id))
