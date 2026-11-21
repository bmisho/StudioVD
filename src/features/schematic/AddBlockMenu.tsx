import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { modelGroups } from "@/core/sim/models/catalog"

/** The built-in blocks (PLAN 11.3), searchable; picking one adds it in the middle of the view. */
export function AddBlockMenu({ onPick }: { onPick: (modelKey: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const groups = useMemo(() => modelGroups(query), [query])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 bg-background px-2 text-xs">
          <Plus className="size-3.5" aria-hidden />
          Add block
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <Input
          aria-label="Search blocks"
          placeholder="Search blocks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 h-7 text-xs"
        />
        <div className="max-h-80 overflow-y-auto" role="list" aria-label="Blocks">
          {groups.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">No block matches “{query}”.</p>
          )}
          {groups.map((g) => (
            <div key={g.category} role="group" aria-label={g.name} className="mb-1">
              <div className="px-1 py-1 text-xs font-medium text-muted-foreground">{g.name}</div>
              {g.models.map(({ key, model }) => (
                <button
                  key={key}
                  type="button"
                  role="listitem"
                  title={model.summary}
                  className="flex w-full flex-col items-start rounded-sm px-2 py-1 text-left hover:bg-accent-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => {
                    onPick(key)
                    setOpen(false)
                  }}
                >
                  <span className="text-xs text-foreground">{model.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
