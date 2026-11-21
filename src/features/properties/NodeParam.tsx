import { useId } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { NodeId, ParamDef } from "@/core/schema"
import { effectiveParam } from "@/core/sim/params"
import { formatSi, parseSi } from "@/core/sim/siText"
import { NumberField } from "@/features/materials/controls/NumberField"
import { useDocumentStore } from "@/store/document/documentStore"
import { NameField } from "./NameField"
import { PropertyToggle } from "./PropertyToggle"

const CONFIDENCE = { high: "high", medium: "medium", low: "low" } as const

/** Where a default comes from, said plainly (CLAUDE.md §12: every number has a source). */
const sourceText = (p: ParamDef) =>
  p.source
    ? `${p.source.note ?? p.source.kind} (confidence ${CONFIDENCE[p.source.confidence]})`
    : `Default ${String(p.default)}`

/** One block parameter (PLAN 11.3): a number with its unit and SI prefixes, a switch, a choice. */
export function NodeParam({ node, param }: { node: NodeId; param: ParamDef }) {
  const id = useId()
  const values = useDocumentStore((s) => s.doc.schematic.nodes[node]?.paramValues)
  const set = useDocumentStore((s) => s.setNodeParam)
  if (!values) return null
  const value = effectiveParam(param, values)
  const hint = sourceText(param)
  if (param.kind === "bool")
    return (
      <PropertyToggle
        label={param.name}
        hint={hint}
        checked={value === true}
        onChange={(v) => set(node, param.key, v)}
      />
    )
  if (param.kind === "text")
    return (
      <div className="flex flex-col gap-1">
        <NameField
          id={id}
          label={param.name}
          name={typeof value === "string" ? value : ""}
          maxLength={2048}
          rename={(text) => set(node, param.key, text)}
        />
      </div>
    )
  return (
    <div className="grid grid-cols-[1fr_8rem] items-center gap-2" title={hint}>
      <Label htmlFor={id} className="text-xs">
        {param.name}
        {param.unit && <span className="text-muted-foreground"> ({param.unit})</span>}
      </Label>
      {param.kind === "choice" ? (
        <Select value={String(value)} onValueChange={(v) => set(node, param.key, v)}>
          <SelectTrigger id={id} size="sm" className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(param.choices ?? []).map((c) => (
              <SelectItem key={c} value={c} className="text-xs">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <NumberField
          id={id}
          value={typeof value === "number" ? value : 0}
          format={formatSi}
          parse={parseSi}
          clamp={(v) =>
            Number.isFinite(v) &&
            (param.min === undefined || v >= param.min) &&
            (param.max === undefined || v <= param.max)
              ? v
              : null
          }
          onChange={(v) => set(node, param.key, v)}
          aria-describedby={`${id}-hint`}
        />
      )}
      <span id={`${id}-hint`} className="sr-only">
        {hint}
      </span>
    </div>
  )
}
