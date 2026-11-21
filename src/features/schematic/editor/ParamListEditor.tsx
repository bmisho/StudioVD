import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { localKey } from "@/core/library/userComponent/keys"
import type { ParamDef } from "@/core/schema"
import { formatSi, parseSi } from "@/core/sim/siText"

/** A black box's numeric parameters (PLAN 11.5): its program reads them by key. */
export function ParamListEditor({
  params,
  onChange,
}: {
  params: ParamDef[]
  onChange: (params: ParamDef[]) => void
}) {
  const edit = (i: number, param: ParamDef) => onChange(params.map((p, j) => (j === i ? param : p)))
  const add = () => {
    const key = localKey("k", new Set(params.map((p) => p.key)), "k")
    onChange([...params, { key, name: key, unit: "", kind: "number", default: 0 }])
  }
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">Parameters</legend>
      {params.map((p, i) => (
        <div
          key={i}
          role="group"
          aria-label={`Parameter ${i + 1}`}
          className="grid grid-cols-[1fr_6rem_3.5rem_6rem_1.75rem] items-center gap-1"
        >
          <Input
            aria-label="Parameter name"
            value={p.name}
            maxLength={120}
            onChange={(e) => edit(i, { ...p, name: e.target.value })}
            className="h-7 text-xs"
          />
          <Input
            aria-label="Parameter key"
            value={p.key}
            maxLength={32}
            spellCheck={false}
            onChange={(e) => edit(i, { ...p, key: e.target.value })}
            className="h-7 font-mono text-xs"
          />
          <Input
            aria-label="Parameter unit"
            value={p.unit}
            maxLength={16}
            onChange={(e) => edit(i, { ...p, unit: e.target.value })}
            className="h-7 text-xs"
          />
          <Input
            aria-label="Parameter default"
            // Uncontrolled: the text stays as typed; each number it parses to applies.
            defaultValue={typeof p.default === "number" ? formatSi(p.default) : ""}
            onChange={(e) => {
              const v = parseSi(e.target.value)
              if (Number.isFinite(v)) edit(i, { ...p, default: v })
            }}
            className="h-7 text-right text-xs tabular-nums"
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={`Remove parameter ${p.name}`}
            onClick={() => onChange(params.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" className="h-7 self-start text-xs" onClick={add}>
        Add parameter
      </Button>
    </fieldset>
  )
}
