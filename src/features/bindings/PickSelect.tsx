import { useId } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Option } from "./pickerOptions"

/** A labelled choice among named entities (an empty list says so). */
export function PickSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | undefined
  options: readonly Option[]
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-0.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? ""} onValueChange={onChange} disabled={options.length === 0}>
        <SelectTrigger id={id} size="sm" className="w-full min-w-0 text-xs">
          <SelectValue placeholder={options.length === 0 ? "None in this project" : "Choose…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
