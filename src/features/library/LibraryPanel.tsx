import { PackagePlus, Search } from "lucide-react"
import { useEffect, useMemo } from "react"
import { rememberDialogReturnFocus } from "@/app/dialogs/focusReturn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { search, searchDoc } from "@/core/library/search"
import { useLibraryStore, type LibraryFilter } from "@/store/session/libraryStore"
import { insertion } from "./insertionService"
import { LibraryDetails } from "./LibraryDetails"
import { LibraryList } from "./LibraryList"
import { libraryController } from "./libraryService"
import { useLibraryItems } from "./useLibraryItems"
import { useLibrarySearch } from "./useLibrarySearch"

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "generators", label: "Generators" },
  { value: "installed", label: "Installed" },
  { value: "user", label: "My components" },
]
const EMPTY: Record<LibraryFilter, string> = {
  all: "No component matches.",
  generators: "No generator matches.",
  installed: "Nothing installed matches. Install a pack from a file with the button above.",
  user: "No saved component matches. Save one from a project (Phase 9.7).",
}

/** The Library tab (PLAN 9.4): sources, search, cards; drag a card into the 3D view. */
export function LibraryPanel() {
  const items = useLibraryItems()
  const query = useLibraryStore((s) => s.query)
  const filter = useLibraryStore((s) => s.filter)
  const activeKey = useLibraryStore((s) => s.activeKey)
  const { setQuery, setFilter, setActive } = useLibraryStore.getState()
  const keys = useLibrarySearch(items, query, filter)
  const shown = useMemo(() => {
    const byKey = new Map(items.map((i) => [i.key, i]))
    return keys.flatMap((k) => byKey.get(k) ?? [])
  }, [items, keys])
  // The remembered card, or the top result when a new search no longer lists it.
  const active = shown.find((i) => i.key === activeKey) ?? shown[0]
  useEffect(() => void libraryController.refresh(), [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-1.5 border-b p-2">
        <div className="flex gap-1">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Search components"
              placeholder="Search (M3 screw, 608…)"
              className="h-7 pl-7 text-xs"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter inserts the top result for exactly what is typed (searched here: the
                // worker's answer may still be on its way); ↓ moves into the list.
                if (e.key === "Enter") {
                  const top = search(items.map(searchDoc), query, filter)[0]
                  const item = items.find((i) => i.key === top)
                  if (item?.insert) void insertion.insertAtDefault(item)
                } else if (e.key === "ArrowDown")
                  document
                    .querySelector<HTMLElement>('[role="listbox"][aria-label="Components"]')
                    ?.focus()
                else return
                e.preventDefault()
              }}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            aria-label="Install components from a file…"
            title="Install components from a file…"
            onClick={() => {
              rememberDialogReturnFocus()
              void libraryController.installFromFile()
            }}
          >
            <PackagePlus className="size-4" aria-hidden />
          </Button>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as LibraryFilter)}>
          <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Library source">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value} className="text-xs">
                {f.label}
              </SelectItem>
            ))}
            <SelectItem value="catalog" disabled className="text-xs">
              Online catalog (Phase 14)
            </SelectItem>
            <SelectItem value="primitives" disabled className="text-xs">
              Schematic primitives (Phase 11)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1 py-1">
        <LibraryList
          items={shown}
          activeKey={active?.key ?? null}
          onActivate={setActive}
          onInsert={(item) => void insertion.insertAtDefault(item)}
          onPress={(item, e) => insertion.press(item, e.nativeEvent)}
          empty={EMPTY[filter]}
        />
      </div>
      {active && (
        <LibraryDetails item={active} onInsert={() => void insertion.insertAtDefault(active)} />
      )}
    </div>
  )
}
