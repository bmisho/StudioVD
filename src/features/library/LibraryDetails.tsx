import { Share } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LibraryItem } from "@/core/library/items"
import { userComponents } from "./libraryService"
import { LicencePopover } from "./LicencePopover"

/** The active card's details under the list: name, what it is, licence, Export and Insert. */
export function LibraryDetails({ item, onInsert }: { item: LibraryItem; onInsert: () => void }) {
  const installed = item.insert?.kind === "installed" ? item.insert : null
  return (
    <div
      className="flex shrink-0 flex-col gap-1 border-t bg-surface p-2 text-xs"
      aria-label="Component details"
    >
      <p className="truncate font-medium">{item.name}</p>
      <p className="truncate text-muted-foreground">{item.detail}</p>
      {item.note && <p className="text-muted-foreground">{item.note}</p>}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <LicencePopover item={item} />
        <div className="flex shrink-0 gap-1">
          {installed && (
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Export as a pack…"
              title="Export as a pack (.stvdpack) to share"
              onClick={() =>
                void userComponents.exportPack({
                  id: installed.id,
                  version: installed.version,
                  origin: installed.origin,
                  manifestSha256: installed.manifestSha256,
                  verified: installed.origin === "official",
                  manifest: installed.text,
                })
              }
            >
              <Share className="size-3.5" aria-hidden />
            </Button>
          )}
          <Button size="sm" className="h-7 text-xs" disabled={!item.insert} onClick={onInsert}>
            Insert
          </Button>
        </div>
      </div>
    </div>
  )
}
