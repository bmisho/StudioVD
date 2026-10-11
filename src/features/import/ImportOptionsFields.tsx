import { useId } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatNeedsUnit, formatOf, type ImportOptions } from "@/core/import/importOptions"
import { LENGTH_UNITS } from "@/core/units"
import type { PickedFile } from "@/lib/tauri/files"
import { useImportStore } from "@/store/session/importStore"

const UNIT_LABELS: Record<(typeof LENGTH_UNITS)[number], string> = {
  mm: "Millimetres",
  cm: "Centimetres",
  m: "Metres",
  in: "Inches",
  ft: "Feet",
}

function Field<K extends keyof ImportOptions>({
  label,
  hint,
  option,
  choices,
}: {
  label: string
  hint?: string
  option: K
  choices: readonly (readonly [ImportOptions[K], string])[]
}) {
  const id = useId()
  const value = useImportStore((s) => s.options[option])
  const setOptions = useImportStore((s) => s.setOptions)
  return (
    <div className="grid grid-cols-[9rem_1fr] items-center gap-x-3 gap-y-0.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select value={value} onValueChange={(v) => setOptions({ [option]: v })}>
        <SelectTrigger id={id} size="sm" className="w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map(([v, text]) => (
            <SelectItem key={v} value={v} className="text-xs">
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="col-start-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Import options (PLAN 4.2). Unit and quality appear only when a chosen file uses them. */
export function ImportOptionsFields({ files }: { files: readonly PickedFile[] }) {
  const formats = files.map((f) => formatOf(f.name))
  const needsUnit = formats.some((f) => f !== null && formatNeedsUnit(f))
  const hasCad = formats.some((f) => f === "step" || f === "iges")
  return (
    <div className="flex flex-col gap-2.5">
      {needsUnit && (
        <Field
          label="Units"
          hint="STL and OBJ files do not store their unit."
          option="unit"
          choices={LENGTH_UNITS.map((u) => [u, UNIT_LABELS[u]] as const)}
        />
      )}
      <Field
        label="Up axis"
        option="upAxis"
        choices={[
          ["y", "Y up"],
          ["z", "Z up (rotated to Y up)"],
        ]}
      />
      {hasCad && (
        <Field
          label="STEP/IGES quality"
          hint="Finer tessellation looks smoother but costs triangles."
          option="quality"
          choices={[
            ["coarse", "Coarse"],
            ["normal", "Normal"],
            ["fine", "Fine"],
          ]}
        />
      )}
      <Field
        label="Parts"
        option="split"
        choices={[
          ["perMesh", "One part per body or mesh"],
          ["single", "Each file as one part"],
        ]}
      />
    </div>
  )
}
