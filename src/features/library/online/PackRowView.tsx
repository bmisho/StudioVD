import { Button } from "@/components/ui/button"
import { packSize } from "@/core/library/catalog/catalogItems"
import type { PackRow } from "@/core/library/catalog/packs"
import { useCatalogStore } from "@/store/session/catalogStore"
import { catalogController } from "./catalogService"
import { DownloadBar } from "./DownloadBar"

const STATUS: Record<PackRow["status"], string> = {
  available: "Not installed",
  installed: "Installed",
  partial: "Partly installed",
  update: "Update available",
}

/** One pack of the Packs dialog: what it holds, and Install / Update / Remove. */
export function PackRowView({ row }: { row: PackRow }) {
  const progress = useCatalogStore((s) =>
    Object.hasOwn(s.downloads, row.pack) ? s.downloads[row.pack] : undefined
  )
  const n = row.components.length
  const get = () => void catalogController.download(row.pack, row.label)
  return (
    <li className="flex flex-col gap-1 px-2 py-1.5 odd:bg-surface" aria-label={row.label}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.label}</p>
          <p className="truncate text-muted-foreground tabular-nums">
            {n} component{n === 1 ? "" : "s"} · {packSize(row.bytes)} · {STATUS[row.status]}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {!progress && (row.status === "available" || row.status === "partial") && (
            <Button size="sm" className="h-7 text-xs" onClick={get}>
              Install
            </Button>
          )}
          {!progress && row.status === "update" && (
            <Button size="sm" className="h-7 text-xs" onClick={get}>
              Update
            </Button>
          )}
          {!progress && row.installed > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void catalogController.removePack(row)}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      {progress && <DownloadBar pack={row.pack} label={row.label} progress={progress} />}
    </li>
  )
}
