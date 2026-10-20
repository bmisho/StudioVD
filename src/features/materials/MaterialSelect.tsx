import { useMemo, type Ref } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { MaterialId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"

/** Select value for "no material" (never a minted id: those are UUIDs). */
const NONE = "none"

/**
 * One of the project's materials, or none (`noneLabel` says what is drawn then). `value`
 * undefined: the selected parts disagree ("Mixed").
 */
export function MaterialSelect({
  id,
  value,
  noneLabel,
  onChange,
  label,
  ref,
}: {
  id: string
  value: MaterialId | null | undefined
  noneLabel: string
  onChange: (id: MaterialId | null) => void
  /** Accessible name when no visible label points at `id`. */
  label?: string
  ref?: Ref<HTMLButtonElement>
}) {
  const materials = useDocumentStore((s) => s.doc.materials)
  const sorted = useMemo(
    () => Object.values(materials).sort((a, b) => a.name.localeCompare(b.name)),
    [materials]
  )
  const select = (v: string) => {
    if (v === NONE) onChange(null)
    else if (Object.hasOwn(materials, v)) onChange(v as MaterialId)
  }
  return (
    <Select value={value === undefined ? "" : (value ?? NONE)} onValueChange={select}>
      <SelectTrigger
        ref={ref}
        id={id}
        size="sm"
        className="w-full min-w-0 text-xs"
        aria-label={label}
      >
        <SelectValue placeholder="Mixed" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} className="text-xs">
          {noneLabel}
        </SelectItem>
        {sorted.map((m) => (
          <SelectItem key={m.id} value={m.id} className="text-xs">
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
