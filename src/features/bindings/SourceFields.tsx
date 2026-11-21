import type { SceneDocument } from "@/core/schema"
import { OptionSelect } from "@/features/schematic/editor/OptionSelect"
import {
  anchorOptions,
  mateOptions,
  nodeOptions,
  outputOptions,
  partOptions,
} from "./pickerOptions"
import { NumberText } from "./NumberText"
import { SOURCE_KINDS, type Draft } from "./bindingKinds"
import { PickSelect } from "./PickSelect"

const str = (v: unknown) => (typeof v === "string" ? v : undefined)

/** Where a bound value comes from (PLAN 13.1): its kind, then what it names. */
export function SourceFields({
  doc,
  draft,
  onChange,
  kinds,
}: {
  doc: SceneDocument
  draft: Draft
  onChange: (d: Draft) => void
  kinds: readonly string[]
}) {
  const set = (patch: Record<string, unknown>) => onChange({ ...draft, ...patch })
  const k = draft.kind
  const allowed = SOURCE_KINDS.filter(([kind]) => kinds.includes(kind))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">From</legend>
      <OptionSelect
        label="Source"
        value={k}
        options={allowed.map(([kind]) => kind)}
        text={(v) => allowed.find(([kind]) => kind === v)?.[1] ?? v}
        onChange={(kind) => onChange({ kind })}
      />
      {(k === "mateCoordinate" || k === "gravityLoad") && (
        <PickSelect
          label="Mate"
          value={str(draft.mate)}
          options={mateOptions(doc, true)}
          onChange={(mate) => set({ mate })}
        />
      )}
      {k === "mass" && (
        <PickSelect
          label="Part"
          value={str(draft.part)}
          options={partOptions(doc)}
          onChange={(part) => set({ part })}
        />
      )}
      {k === "contact" && (
        <div className="grid grid-cols-2 gap-2">
          <PickSelect
            label="Part"
            value={str(draft.a)}
            options={partOptions(doc)}
            onChange={(a) => set({ a })}
          />
          <PickSelect
            label="Touching"
            value={str(draft.b)}
            options={partOptions(doc)}
            onChange={(b) => set({ b })}
          />
        </div>
      )}
      {(k === "distance" || k === "range") && (
        <PickSelect
          label={k === "range" ? "From anchor (along its z)" : "From anchor"}
          value={str(k === "range" ? draft.anchor : draft.a)}
          options={anchorOptions(doc)}
          onChange={(v) => set(k === "range" ? { anchor: v } : { a: v })}
        />
      )}
      {k === "distance" && (
        <PickSelect
          label="To anchor"
          value={str(draft.b)}
          options={anchorOptions(doc)}
          onChange={(b) => set({ b })}
        />
      )}
      {k === "range" && (
        <NumberText label="Up to (m)" value={draft.maxM} onChange={(maxM) => set({ maxM })} />
      )}
      {(k === "light" || k === "output") && (
        <PickSelect
          label="Block"
          value={str(draft.node)}
          options={nodeOptions(doc)}
          onChange={(node) => set({ node, port: undefined })}
        />
      )}
      {k === "light" && str(draft.node) && (
        <>
          <PickSelect
            label="Light output"
            value={str(draft.port)}
            options={outputOptions(doc, str(draft.node) ?? "", true)}
            onChange={(port) => set({ port })}
          />
          <div className="grid grid-cols-2 gap-2">
            <PickSelect
              label="Emitter anchor"
              value={str(draft.emitter)}
              options={anchorOptions(doc)}
              onChange={(emitter) => set({ emitter })}
            />
            <PickSelect
              label="Sensor anchor"
              value={str(draft.sensor)}
              options={anchorOptions(doc)}
              onChange={(sensor) => set({ sensor })}
            />
          </div>
          <NumberText
            label="Beam half-angle (rad)"
            value={draft.halfAngle}
            onChange={(halfAngle) => set({ halfAngle })}
          />
        </>
      )}
      {k === "output" && str(draft.node) && (
        <PickSelect
          label="Value"
          value={
            str(draft.port) && str(draft.quantity)
              ? `${str(draft.port)}|${str(draft.quantity)}`
              : undefined
          }
          options={outputOptions(doc, str(draft.node) ?? "")}
          onChange={(v) => {
            const [port, quantity] = v.split("|")
            set({ port, quantity })
          }}
        />
      )}
    </fieldset>
  )
}
