import { ArrowDown, ArrowUp, X } from "lucide-react"
import { useMemo } from "react"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Cable } from "@/core/connectors/cableMesh"
import { anchorLabel, waypointChoices } from "@/core/connectors/routeLabels"
import { MAX_CABLE_VIA, type AnchorId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"

/**
 * A cable's waypoints in route order (PLAN 16.3): move one up or down, remove it, or add any
 * other anchor (a clip's, a wall's) at the end of the list.
 */
export function CableWaypoints({ cable: c }: { cable: Cable }) {
  const { anchors, parts } = useDocumentStore(
    useShallow((s) => ({ anchors: s.doc.anchors, parts: s.doc.parts }))
  )
  const doc = useMemo(() => ({ anchors, parts }), [anchors, parts])
  const route = useMemo(() => [c.ends[0], ...c.via, c.ends[1]], [c])
  const choices = useMemo(() => waypointChoices(doc, route), [doc, route])
  const setVia = (via: AnchorId[]) => useDocumentStore.getState().setCableVia(c.id, via)
  const moved = (i: number, by: -1 | 1) => {
    const via = [...c.via]
    const [item] = via.splice(i, 1)
    if (item) via.splice(i + by, 0, item)
    setVia(via)
  }
  return (
    <section className="flex flex-col gap-1" aria-label="Waypoints">
      <h4 className="text-xs font-medium">Route</h4>
      <ol className="flex flex-col gap-0.5 text-xs">
        <li className="truncate text-muted-foreground">From {anchorLabel(doc, c.ends[0])}</li>
        {c.via.map((id, i) => (
          <li key={id} className="flex items-center gap-1">
            <span className="flex-1 truncate">
              {i + 1}. {anchorLabel(doc, id)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Move waypoint ${i + 1} up`}
              disabled={i === 0}
              onClick={() => moved(i, -1)}
            >
              <ArrowUp className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Move waypoint ${i + 1} down`}
              disabled={i === c.via.length - 1}
              onClick={() => moved(i, 1)}
            >
              <ArrowDown className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Remove waypoint ${i + 1}`}
              onClick={() => setVia(c.via.filter((_, j) => j !== i))}
            >
              <X className="size-3.5" />
            </Button>
          </li>
        ))}
        <li className="truncate text-muted-foreground">To {anchorLabel(doc, c.ends[1])}</li>
      </ol>
      {c.via.length < MAX_CABLE_VIA && choices.length > 0 && (
        <Select value="" onValueChange={(v) => setVia([...c.via, v as AnchorId])}>
          <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Add waypoint">
            <SelectValue placeholder="Add waypoint…" />
          </SelectTrigger>
          <SelectContent>
            {choices.map((o) => (
              <SelectItem key={o.id} value={o.id} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </section>
  )
}
