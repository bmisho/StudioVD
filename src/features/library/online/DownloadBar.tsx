import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { packSize } from "@/core/library/catalog/catalogItems"
import type { DownloadProgress } from "@/lib/tauri/catalog"
import { catalogController } from "./catalogService"

/** A pack download in progress, with Cancel (PLAN 14.3). */
export function DownloadBar({
  pack,
  label,
  progress,
}: {
  pack: string
  label: string
  progress: DownloadProgress
}) {
  const share = progress.total > 0 ? progress.done / progress.total : 0
  const percent = Math.round(share * 100)
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={`Downloading ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
      >
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {progress.total > 0
          ? `${packSize(progress.done)} of ${packSize(progress.total)}`
          : "Starting…"}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label={`Cancel the download of ${label}`}
        onClick={() => void catalogController.cancel(pack)}
      >
        <X className="size-3.5" aria-hidden />
      </Button>
    </div>
  )
}
