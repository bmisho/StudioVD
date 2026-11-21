import { useId, useMemo } from "react"
import { Label } from "@/components/ui/label"
import type { BlockDef } from "@/core/schema"
import { MAX_BEHAVIOUR_CHARS } from "@/core/schema/schematic"
import { behaviourNames, checkBehaviour } from "@/core/sim/expr/check"
import { FUNCTIONS } from "@/core/sim/expr/functions"

const FUNCTION_LIST = [...FUNCTIONS.keys()].join(", ")

/** A block's program (PLAN 11.5): `name = expression` lines, checked as they are typed. */
export function BehaviourEditor({
  value,
  def,
  onChange,
}: {
  value: string
  def: Pick<BlockDef, "ports" | "params">
  onChange: (value: string) => void
}) {
  const id = useId()
  const check = useMemo(() => checkBehaviour(value, def), [value, def])
  const names = useMemo(() => behaviourNames(def), [def])
  const problems = [
    ...(check.error ? [check.error.message] : []),
    ...(check.unknown.length ? [`Not an input or parameter: ${check.unknown.join(", ")}`] : []),
    ...(check.readOnly.length ? [`Inputs cannot be set: ${check.readOnly.join(", ")}`] : []),
  ]
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        Behaviour
      </Label>
      <textarea
        id={id}
        value={value}
        maxLength={MAX_BEHAVIOUR_CHARS}
        spellCheck={false}
        rows={8}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problems.length > 0 ? true : undefined}
        aria-describedby={`${id}-problems ${id}-help`}
        placeholder="out = vin > level ? 1 : 0"
        className="min-h-32 rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive"
      />
      <div id={`${id}-problems`} role="status" className="text-xs">
        {problems.map((p) => (
          <p key={p} className="text-destructive">
            {p}
          </p>
        ))}
        {problems.length === 0 && check.unset.length > 0 && (
          <p className="text-warning">Never set: {check.unset.join(", ")}</p>
        )}
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        One <code>name = expression</code> per line. Reads:{" "}
        <code>{names.inputs.join(", ") || "none"}</code>. Sets:{" "}
        <code>{names.outputs.join(", ") || "none"}</code>. Operators + − * / % ^, comparisons, && ||
        !, <code>a ? b : c</code>; functions {FUNCTION_LIST}; PI, E. {value.length}/
        {MAX_BEHAVIOUR_CHARS} characters.
      </p>
    </div>
  )
}
