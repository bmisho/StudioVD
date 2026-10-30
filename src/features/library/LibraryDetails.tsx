import { Button } from "@/components/ui/button"
import type { LibraryItem } from "@/core/library/items"
import { LicencePopover } from "./LicencePopover"

/** The active card's details under the list: name, what it is, licence, and Insert. */
export function LibraryDetails({ item, onInsert }: { item: LibraryItem; onInsert: () => void }) {
  return (
    <div
      className="flex shrink-0 flex-col gap-1 border-t bg-surface p-2 text-xs"
      aria-label="Component details"
    >
      <p className="truncate font-medium">{item.name}</p>
      <p className="truncate text-muted-foreground">{item.detail}</p>
      {item.note && <p className="text-muted-foreground">{item.note}</p>}
      <div className="flex items-center justify-between gap-2">
        <LicencePopover item={item} />
        <Button size="sm" className="h-7 text-xs" disabled={!item.insert} onClick={onInsert}>
          Insert
        </Button>
      </div>
    </div>
  )
}
