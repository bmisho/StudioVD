import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** A compact labelled select over a fixed list of string options. */
export function OptionSelect<T extends string>({
  label,
  value,
  options,
  text,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  text?: (v: T) => string
  onChange: (v: T) => void
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const found = options.find((o) => o === v)
        if (found !== undefined) onChange(found)
      }}
    >
      <SelectTrigger size="sm" aria-label={label} className="h-7 w-full min-w-0 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="text-xs">
            {text ? text(o) : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
