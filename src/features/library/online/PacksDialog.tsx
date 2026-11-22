import { TriangleAlert } from "lucide-react"
import { useMemo } from "react"
import { restoreDialogFocus } from "@/app/dialogs/focusReturn"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { packSize } from "@/core/library/catalog/catalogItems"
import { oldVersions, packRows, revokedInstalls } from "@/core/library/catalog/packs"
import { useCatalogStore } from "@/store/session/catalogStore"
import { useLibraryStore } from "@/store/session/libraryStore"
import { catalogController } from "./catalogService"
import { PackRowView } from "./PackRowView"

/** Library › Packs (PLAN 14.5): every pack of the cached catalog, with what is installed. */
export function PacksDialog() {
  const open = useCatalogStore((s) => s.packsOpen)
  const index = useCatalogStore((s) => s.index)
  const usage = useCatalogStore((s) => s.usage)
  const installed = useLibraryStore((s) => s.installed)
  const rows = useMemo(() => (index ? packRows(index, installed) : []), [index, installed])
  const revoked = useMemo(
    () => (index ? revokedInstalls(index, installed) : []),
    [index, installed]
  )
  const old = useMemo(() => oldVersions(installed), [installed])
  const close = () => useCatalogStore.getState().setPacksOpen(false)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={restoreDialogFocus}>
        <DialogHeader>
          <DialogTitle>Packs</DialogTitle>
          <DialogDescription>
            {index
              ? `${rows.length} packs in catalog #${index.sequence}. Projects keep their own copies: removing a pack never changes a project.`
              : "Refresh the catalog to see its packs."}
          </DialogDescription>
        </DialogHeader>
        {index?.notices.map((n) => (
          <p
            key={n.id}
            className={
              n.severity === "warning" ? "text-xs text-warning" : "text-xs text-muted-foreground"
            }
          >
            {n.text}
          </p>
        ))}
        {revoked.length > 0 && (
          <div
            role="alert"
            className="flex flex-col gap-1 rounded-md border border-destructive p-2 text-xs"
          >
            {revoked.map((r) => (
              <p key={`${r.id}@${r.version}`} className="flex gap-2 text-destructive">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {r.id} {r.version} was withdrawn ({r.severity}): {r.reason}
              </p>
            ))}
          </div>
        )}
        <ul aria-label="Packs" className="max-h-72 overflow-auto rounded-md border text-xs">
          {rows.map((row) => (
            <PackRowView key={row.pack} row={row} />
          ))}
          {index && rows.length === 0 && <li className="p-2 text-muted-foreground">No packs.</li>}
        </ul>
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground tabular-nums">
            {usage
              ? `Library ${packSize(usage.store)} · catalog ${packSize(usage.catalogs)}${usage.downloads > 0 ? ` · unfinished downloads ${packSize(usage.downloads)}` : ""}`
              : ""}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              aria-disabled={old.length === 0}
              title={old.length === 0 ? "No component has an older version installed" : undefined}
              onClick={() => old.length > 0 && void catalogController.removeOldVersions()}
            >
              Remove old versions{old.length > 0 ? ` (${old.length})` : ""}
            </Button>
            <Button size="sm" onClick={close}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
