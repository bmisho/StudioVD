import { useId, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { NodeId, PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"

/** Which part a block stands for (PLAN 11.6), as a component instance. */
export function NodeLink({ node }: { node: NodeId }) {
  const id = useId()
  const instance = useDocumentStore((s) => {
    const c = s.doc.schematic.nodes[node]?.componentInstanceId
    return c !== undefined ? s.doc.components[c] : undefined
  })
  const parts = useDocumentStore((s) => s.doc.parts)
  const groups = useDocumentStore((s) => s.doc.groups)
  const link = useDocumentStore((s) => s.linkNode)
  const sorted = useMemo(
    () => Object.values(parts).sort((a, b) => a.name.localeCompare(b.name)),
    [parts]
  )
  const linkedPart = instance ? Object.values(instance.parts)[0] : undefined
  const groupName = instance ? groups[instance.groupId]?.name : undefined
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Part
      </Label>
      {instance && (
        <p className="text-xs">
          <span className="tabular-nums">{instance.designator}</span>
          {groupName && <span className="text-muted-foreground"> · {groupName}</span>}
        </p>
      )}
      <div className="flex gap-1">
        <Select
          value={linkedPart ?? ""}
          onValueChange={(v) => link(node, v as PartId)}
          disabled={sorted.length === 0}
        >
          <SelectTrigger id={id} size="sm" className="w-full min-w-0 text-xs">
            <SelectValue placeholder={sorted.length === 0 ? "No parts yet" : "Link to a part…"} />
          </SelectTrigger>
          <SelectContent>
            {sorted.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {instance && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => link(node, null)}
          >
            Unlink
          </Button>
        )}
      </div>
    </div>
  )
}
