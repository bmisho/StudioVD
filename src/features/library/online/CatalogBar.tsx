import { Package, RefreshCw, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCatalogStore } from "@/store/session/catalogStore"
import { catalogController, networkController } from "./catalogService"

const ago = (fetchedAt: number) => {
  const days = Math.floor((Date.now() / 1000 - fetchedAt) / 86_400)
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`
}

/** Above the Online catalog list (PLAN 14.5): what the cached catalog is, and its actions. */
export function CatalogBar() {
  const status = useCatalogStore((s) => s.status)
  const index = useCatalogStore((s) => s.index)
  const error = useCatalogStore((s) => s.indexError)
  const refreshing = useCatalogStore((s) => s.refreshing)
  const text = !status
    ? "Reading the catalog…"
    : status.offline
      ? "Offline mode is on."
      : !status.configured
        ? "This build has no online catalog. Install from file still works."
        : error
          ? error
          : index
            ? `Catalog #${index.sequence}, ${index.components.length} components, refreshed ${status.fetchedAt ? ago(status.fetchedAt) : "once"}${status.expired ? " (expired: refresh before installing)" : ""}.`
            : "Online catalog not downloaded yet: Refresh to browse it."
  const icon = "size-7"
  return (
    <div
      className="flex items-center gap-1 border-b bg-surface px-2 py-1 text-xs"
      aria-label="Online catalog"
    >
      <p className="min-w-0 flex-1 text-muted-foreground" role="status">
        {text}
      </p>
      <Button
        variant="outline"
        size="icon"
        className={icon}
        aria-label="Refresh the catalog"
        title="Refresh the catalog (downloads its index)"
        aria-disabled={refreshing}
        onClick={() => !refreshing && void catalogController.refresh()}
      >
        <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className={icon}
        aria-label="Packs…"
        title="Install, update and remove packs"
        onClick={() => {
          useCatalogStore.getState().setPacksOpen(true)
          void catalogController.loadUsage()
        }}
      >
        <Package className="size-3.5" aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className={icon}
        aria-label="Network settings…"
        title="Network settings (offline mode, proxy, mirror)"
        onClick={() => void networkController.open()}
      >
        <Settings className="size-3.5" aria-hidden />
      </Button>
    </div>
  )
}
