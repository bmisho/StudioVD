import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SceneDocument } from "@/core/schema"
import { OptionSelect } from "@/features/schematic/editor/OptionSelect"
import {
  anchorOptions,
  inputOptions,
  mateOptions,
  nodeOptions,
  paramOptions,
  partOptions,
} from "./pickerOptions"
import { PickSelect } from "./PickSelect"
import { TARGET_KINDS, type Draft } from "./bindingKinds"

const COLOURS = ["red", "green", "blue", "white", "yellow", "amber"] as const
const str = (v: unknown) => (typeof v === "string" ? v : undefined)

/** Where a bound value goes (PLAN 13.1): a block, or something drawn in 3D. */
export function TargetFields({
  doc,
  draft,
  onChange,
  kinds,
  light,
}: {
  doc: SceneDocument
  draft: Draft
  onChange: (d: Draft) => void
  kinds: readonly string[]
  /** The source is a light path: only light inputs. */
  light: boolean
}) {
  const set = (patch: Record<string, unknown>) => onChange({ ...draft, ...patch })
  const k = draft.kind
  const node = str(draft.node)
  const allowed = TARGET_KINDS.filter(([kind]) => kinds.includes(kind))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">To</legend>
      <OptionSelect
        label="Target"
        value={k}
        options={allowed.map(([kind]) => kind)}
        text={(v) => allowed.find(([kind]) => kind === v)?.[1] ?? v}
        onChange={(kind) => onChange({ kind })}
      />
      {(k === "param" || k === "input") && (
        <PickSelect
          label="Block"
          value={node}
          options={nodeOptions(doc)}
          onChange={(n) => set({ node: n, param: undefined, port: undefined })}
        />
      )}
      {k === "param" && node && (
        <PickSelect
          label="Parameter"
          value={str(draft.param)}
          options={paramOptions(doc, node)}
          onChange={(param) => set({ param })}
        />
      )}
      {k === "input" && node && (
        <PickSelect
          label="Input"
          value={str(draft.port)}
          options={inputOptions(doc, node, light ? "light" : undefined)}
          onChange={(port) => set({ port })}
        />
      )}
      {(k === "glow" || k === "tint") && (
        <PickSelect
          label="Part"
          value={str(draft.part)}
          options={partOptions(doc)}
          onChange={(part) => set({ part })}
        />
      )}
      {k === "glow" && (
        <OptionSelect
          label="Colour"
          value={str(draft.color) ?? "red"}
          options={COLOURS}
          onChange={(color) => set({ color })}
        />
      )}
      {(k === "arrow" || k === "label") && (
        <PickSelect
          label="Anchor"
          value={str(draft.anchor)}
          options={anchorOptions(doc)}
          onChange={(anchor) => set({ anchor })}
        />
      )}
      {k === "label" && (
        <Label className="text-xs text-muted-foreground">
          Unit
          <Input
            defaultValue={str(draft.unit) ?? ""}
            maxLength={16}
            onChange={(e) => set({ unit: e.target.value })}
            className="mt-0.5 h-7 text-xs"
          />
        </Label>
      )}
      {k === "ghost" && (
        <PickSelect
          label="Mate"
          value={str(draft.mate)}
          options={mateOptions(doc, true)}
          onChange={(mate) => set({ mate })}
        />
      )}
    </fieldset>
  )
}
