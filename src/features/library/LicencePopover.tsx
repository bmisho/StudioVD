import { Info } from "lucide-react"
import type { LibraryItem } from "@/core/library/items"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** "Licence & source" (PLAN 9.4): the grants, creators and where every number comes from. */
export function LicencePopover({ item }: { item: LibraryItem }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
          <Info className="size-3.5" aria-hidden />
          Licence &amp; source
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 text-xs"
        aria-label={`Licence and source of ${item.name}`}
      >
        <p className="font-medium">{item.name}</p>
        <dl className="mt-2 space-y-2">
          {item.licence.map((l) => (
            <div key={l.what}>
              <dt className="text-muted-foreground">{l.what}</dt>
              <dd>
                {l.spdx} · {l.creators.join(", ") || "unknown creators"}
                {l.attributionRequired ? " · attribution required" : ""}
                {l.source && (
                  <span className="block break-all text-muted-foreground">{l.source}</span>
                )}
                {l.modifications && (
                  <span className="block text-muted-foreground">{l.modifications}</span>
                )}
              </dd>
            </div>
          ))}
          {item.licence.length === 0 && (
            <p className="text-muted-foreground">{item.note ?? "No licence information."}</p>
          )}
        </dl>
        {item.sources.length > 0 && (
          <>
            <p className="mt-3 font-medium">Where the numbers come from</p>
            <ul className="mt-1 space-y-1">
              {item.sources.map((s) => (
                <li key={s.what}>
                  <span className="text-muted-foreground">{s.what}:</span>{" "}
                  {s.source.note ?? s.source.kind}{" "}
                  <span className="text-muted-foreground">
                    ({s.source.kind}, {s.source.confidence} confidence)
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
