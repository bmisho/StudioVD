import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { paramFields, type ParamField } from "@/core/generators/paramFields"
import type { AnyGenerator } from "@/core/generators/types"
import type { GeneratorParams } from "@/core/schema"

type Value = GeneratorParams[string]

/** One parameter's control (a private helper of the form). */
function FieldControl({
  field,
  id,
  value,
  onChange,
}: {
  field: ParamField
  id: string
  value: Value | undefined
  onChange: (v: Value) => void
}) {
  if (field.kind === "boolean")
    return <Switch id={id} checked={value === true} onCheckedChange={(on) => onChange(on)} />
  if (field.kind === "choice")
    return (
      <Select
        value={String(value)}
        onValueChange={(v) => onChange(field.options.find((o) => String(o) === v) ?? v)}
      >
        <SelectTrigger id={id} size="sm" className="h-7 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={String(o)} value={String(o)} className="text-xs">
              {String(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  return (
    <Input
      id={id}
      inputMode="decimal"
      className="h-7 text-xs tabular-nums"
      value={String(value ?? "")}
      onChange={(e) => {
        const text = e.target.value.trim()
        const n = Number(text.replace(",", "."))
        onChange(
          field.kind === "numberOrAuto" && text === "auto"
            ? "auto"
            : text !== "" && Number.isFinite(n)
              ? n
              : text
        )
      }}
    />
  )
}

/** Edit parameters (PLAN 9.5): a form from the generator's schema; Apply regenerates. */
export function GeneratorParamsForm({
  gen,
  params,
  onApply,
}: {
  gen: AnyGenerator
  params: GeneratorParams
  onApply: (params: GeneratorParams) => Promise<string | null>
}) {
  const fields = useMemo(() => paramFields(gen.params), [gen])
  const [draft, setDraft] = useState<GeneratorParams>(params)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const checked = gen.params.safeParse(draft)
  const changed = JSON.stringify(draft) !== JSON.stringify(params)
  const problem = checked.success ? null : (checked.error.issues[0]?.message ?? "Not valid.")
  return (
    <form
      className="flex flex-col gap-1.5"
      aria-label="Parameters"
      onSubmit={(e) => {
        e.preventDefault()
        if (!checked.success || !changed || busy) return
        setBusy(true)
        void onApply(checked.data).then((message) => {
          setBusy(false)
          setError(message)
        })
      }}
    >
      {fields.map((f) => {
        const id = `param-${f.key}`
        return (
          <div key={f.key} className="grid grid-cols-[1fr_8rem] items-center gap-2 text-xs">
            <label htmlFor={id} className="text-muted-foreground">
              {f.label}
            </label>
            <FieldControl
              field={f}
              id={id}
              value={draft[f.key]}
              onChange={(v) => setDraft({ ...draft, [f.key]: v })}
            />
          </div>
        )
      })}
      {(problem ?? error) && changed && (
        <p className="text-xs text-destructive">{problem ?? error}</p>
      )}
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={!changed || busy}
          onClick={() => setDraft(params)}
        >
          Reset
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-7 text-xs"
          disabled={!changed || !checked.success || busy}
        >
          {busy ? "Applying…" : "Apply"}
        </Button>
      </div>
    </form>
  )
}
