import { useRef, type KeyboardEvent, type PointerEvent } from "react"
import type { LibraryItem } from "@/core/library/items"
import { CARD_HEIGHT, LibraryCard } from "./LibraryCard"
import { useVirtualRows } from "./useVirtualRows"

interface LibraryListProps {
  items: readonly LibraryItem[]
  activeKey: string | null
  onActivate: (key: string) => void
  /** Enter or double-click: insert at the default place (PLAN 9.5). */
  onInsert: (item: LibraryItem) => void
  /** A primary press on an insertable card: the insertion drag may start (PLAN 9.5). */
  onPress: (item: LibraryItem, event: PointerEvent) => void
  empty: string
}

const optionId = (index: number) => `library-option-${index}`

/**
 * The cards as a listbox (WAI-ARIA): one tab stop, the active card as its active descendant,
 * arrows, Home/End; only the rows on screen are rendered (PLAN 9.4).
 */
export function LibraryList({
  items,
  activeKey,
  onActivate,
  onInsert,
  onPress,
  empty,
}: LibraryListProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const { first, last } = useVirtualRows(scroller, items.length, CARD_HEIGHT)
  const activeIndex = items.findIndex((i) => i.key === activeKey)

  const moveTo = (index: number) => {
    const item = items[Math.max(0, Math.min(items.length - 1, index))]
    if (!item) return
    onActivate(item.key)
    const el = scroller.current
    const at = items.indexOf(item) * CARD_HEIGHT
    if (el && at < el.scrollTop) el.scrollTop = at
    else if (el && at + CARD_HEIGHT > el.scrollTop + el.clientHeight)
      el.scrollTop = at + CARD_HEIGHT - el.clientHeight
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => moveTo(activeIndex + 1),
      ArrowUp: () => moveTo(activeIndex < 0 ? 0 : activeIndex - 1),
      Home: () => moveTo(0),
      End: () => moveTo(items.length - 1),
      Enter: () => {
        const item = items[activeIndex]
        if (item?.insert) onInsert(item)
      },
    }
    const handle = keys[e.key]
    if (!handle || e.ctrlKey || e.metaKey || e.altKey) return // the rest bubbles to the registry
    e.preventDefault()
    handle()
  }

  if (items.length === 0) return <p className="p-3 text-xs text-muted-foreground">{empty}</p>
  return (
    <div
      ref={scroller}
      role="listbox"
      aria-label="Components"
      tabIndex={0}
      aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
      onKeyDown={onKeyDown}
      onFocus={() => activeIndex < 0 && moveTo(0)}
      className="relative h-full overflow-y-auto px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div style={{ height: items.length * CARD_HEIGHT }}>
        {items.slice(first, last).map((item, i) => {
          const index = first + i
          return (
            <div
              key={item.key}
              id={optionId(index)}
              role="option"
              aria-selected={item.key === activeKey}
              aria-setsize={items.length}
              aria-posinset={index + 1}
              aria-disabled={item.insert ? undefined : true}
              className="absolute inset-x-1 cursor-grab select-none"
              style={{ top: index * CARD_HEIGHT, height: CARD_HEIGHT - 2 }}
              onPointerDown={(e) => {
                onActivate(item.key)
                if (e.button === 0 && item.insert) onPress(item, e)
              }}
              onDoubleClick={() => item.insert && onInsert(item)}
            >
              <LibraryCard item={item} active={item.key === activeKey} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
