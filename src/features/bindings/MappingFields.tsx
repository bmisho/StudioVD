import { NumberText } from "./NumberText"

export interface Mapping {
  scale?: number
  offset?: number
  min?: number
  max?: number
}

/** value × scale + offset, then clamped (PLAN 13.1). */
export function MappingFields({
  mapping,
  onChange,
}: {
  mapping: Mapping
  onChange: (m: Mapping) => void
}) {
  const set = (key: keyof Mapping) => (v: number | undefined) => onChange({ ...mapping, [key]: v })
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">
        Mapping: value × scale + offset, then kept between min and max
      </legend>
      <div className="grid grid-cols-4 gap-2">
        <NumberText label="Scale" value={mapping.scale} onChange={set("scale")} />
        <NumberText label="Offset" value={mapping.offset} onChange={set("offset")} />
        <NumberText label="Min" value={mapping.min} onChange={set("min")} />
        <NumberText label="Max" value={mapping.max} onChange={set("max")} />
      </div>
    </fieldset>
  )
}
