import { useId, useRef, useState, type KeyboardEvent } from "react"
import { BUILTIN_MATERIALS } from "@/core/materials/builtinMaterials"
import { builtinByKey, matchesBuiltin } from "@/core/materials/presets"
import type { PartId, SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { PresetTile } from "./PresetTile"

const COLUMNS = 4

/** The preset the parts all use, unchanged (so its tile shows as pressed), else null. */
function currentPreset(doc: SceneDocument, partIds: readonly PartId[]): string | null {
  const ids = new Set(
    partIds.map((id) => (Object.hasOwn(doc.parts, id) ? doc.parts[id]?.materialId : null))
  )
  const [only] = ids
  if (ids.size !== 1 || !only || !Object.hasOwn(doc.materials, only)) return null
  const material = doc.materials[only]
  const builtin = material?.builtinKey ? builtinByKey(material.builtinKey) : undefined
  return material && builtin && matchesBuiltin(material, builtin) ? builtin.key : null
}

/**
 * The built-in materials (PLAN 6.2-6.4) as a toolbar of preview tiles: one tab stop, arrow
 * keys move between tiles (up and down by a row), Enter or Space gives the focused preset to
 * the selected parts, and a tile dragged onto a part in the 3D view gives it to that part.
 */
export function PresetGrid({ partIds }: { partIds: readonly PartId[] }) {
  const hintId = useId()
  const [focus, setFocus] = useState(0)
  const tiles = useRef<(HTMLButtonElement | null)[]>([])
  const current = useDocumentStore((s) => currentPreset(s.doc, partIds))
  const assignBuiltin = useDocumentStore((s) => s.assignBuiltin)
  const count = BUILTIN_MATERIALS.length

  const move = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const steps: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index + COLUMNS,
      ArrowUp: index - COLUMNS,
      Home: 0,
      End: count - 1,
    }
    const next = steps[e.key]
    if (next === undefined || next < 0 || next >= count) return
    e.preventDefault()
    setFocus(next)
    tiles.current[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        role="toolbar"
        aria-label="Material presets"
        aria-orientation="horizontal"
        className="grid grid-cols-4 gap-0.5"
      >
        {BUILTIN_MATERIALS.map((preset, i) => (
          <PresetTile
            key={preset.key}
            ref={(el) => {
              tiles.current[i] = el
            }}
            preset={preset}
            current={current === preset.key}
            disabled={partIds.length === 0}
            tabStop={i === focus}
            hintId={hintId}
            onApply={() => assignBuiltin(partIds, preset.key)}
            onDrop={(partId) => assignBuiltin([partId], preset.key)}
            onFocus={() => setFocus(i)}
            onKeyDown={(e) => move(e, i)}
          />
        ))}
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        Click to apply to the selection, or drag onto a part.
      </p>
    </div>
  )
}
