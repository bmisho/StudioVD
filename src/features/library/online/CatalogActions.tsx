import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { packSize } from "@/core/library/catalog/catalogItems"
import type { CatalogCard } from "@/core/library/items"
import { useCatalogStore } from "@/store/session/catalogStore"
import { catalogController } from "./catalogService"
import { DownloadBar } from "./DownloadBar"

/** A catalog card not installed yet: download its pack (with progress and Cancel). */
export function CatalogActions({ card, name }: { card: CatalogCard; name: string }) {
  const progress = useCatalogStore((s) =>
    Object.hasOwn(s.downloads, card.pack) ? s.downloads[card.pack] : undefined
  )
  if (progress) return <DownloadBar pack={card.pack} label={name} progress={progress} />
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1 self-start text-xs"
      onClick={() => void catalogController.download(card.pack, name)}
    >
      <Download className="size-3.5" aria-hidden />
      Download pack ({packSize(card.bytes)})
    </Button>
  )
}
