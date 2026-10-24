import { useId } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

/** A labelled switch with a hint: as a tooltip, and for screen readers as its description. */
export function PropertyToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-2" title={hint}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Switch
        id={id}
        size="sm"
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={`${id}-hint`}
      />
      {/* The tooltip is mouse-only; screen readers get the same hint here. */}
      <span id={`${id}-hint`} className="sr-only">
        {hint}
      </span>
    </div>
  )
}
