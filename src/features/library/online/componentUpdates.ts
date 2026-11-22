import { APP_VERSION } from "@/core/app-info"
import type { ComponentOffer } from "@/core/library/catalog/offers"
import { installedItems } from "@/core/library/items"
import type { ComponentInstanceId } from "@/core/schema"
import { toastNotifier as notify } from "@/lib/notify"
import { writeAsset } from "@/lib/tauri/files"
import { copyComponentIntoProject } from "@/lib/tauri/library"
import { useDocumentStore } from "@/store/document/documentStore"
import { useLibraryStore } from "@/store/session/libraryStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { generateComponent } from "../generatorClient"
import { prepareInsertion } from "../prepareInsertion"
import { catalogController } from "./catalogService"

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Update or Replace a placed component (PLAN 4.6, 14.6): its pack downloaded first when the
 * newer version is only in the catalog, then its files copied into the project and the swap
 * made in ONE undo entry (Update keeps ids by key; Replace places new entities in the frame).
 */
export async function applyOffer(
  instance: ComponentInstanceId,
  offer: ComponentOffer
): Promise<void> {
  if (useSessionStore.getState().testMode)
    return notify.error("Leave test mode to update a component")
  const what = `${offer.id} ${offer.to}`
  if (!offer.installed) {
    if (!offer.pack) return notify.error(`${what} is not available`)
    await catalogController.download(offer.pack, what)
  }
  const record = useLibraryStore
    .getState()
    .installed.find((r) => r.id === offer.id && r.version === offer.to)
  const item = record ? installedItems([record], APP_VERSION)[0] : undefined
  if (!item?.insert) return notify.error(`${what} is not installed`, item?.note)
  try {
    const ready = await prepareInsertion(
      item.insert,
      { generate: generateComponent, writeAsset, copyComponentIntoProject },
      () => useDocumentStore.getState().doc.assets
    )
    const doc = useDocumentStore.getState()
    if (offer.kind === "update") {
      doc.regenerateComponent(instance, ready.def, ready.assets, ready.licenseTexts)
      notify.success(`Updated to ${what}`)
    } else {
      const group = doc.replaceComponent(instance, ready.def, ready.assets, ready.licenseTexts)
      useSessionStore.getState().select([{ kind: "group", id: group }])
      notify.success(`Replaced with ${what}`)
    }
  } catch (e) {
    notify.error(`${what} could not be applied`, message(e))
  }
}
