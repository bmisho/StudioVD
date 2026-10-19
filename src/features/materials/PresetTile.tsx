import type { KeyboardEvent, Ref } from "react"
import type { BuiltinMaterial } from "@/core/materials/builtinMaterials"
import type { PartId } from "@/core/schema"
import { presetMaterial } from "@/features/viewport/materials/presetMaterials"
import { cn } from "@/lib/utils"
import { MaterialThumb } from "./MaterialThumb"
import { presetAppearanceKey } from "./previewCache"
import { useDragToPart } from "./useDragToPart"

export const THUMB_PX = 40

/**
 * One built-in preset in the preset toolbar: a click (or Enter/Space) gives it to the
 * selection, a drag onto a part in the 3D view gives it to that part only (PLAN 6.4).
 */
export function PresetTile({
  preset,
  current,
  disabled,
  tabStop,
  hintId,
  onApply,
  onDrop,
  onFocus,
  onKeyDown,
  ref,
}: {
  preset: BuiltinMaterial
  current: boolean
  disabled: boolean
  tabStop: boolean
  /** Id of the text explaining the drag (screen readers). */
  hintId: string
  onApply: () => void
  onDrop: (partId: PartId) => void
  onFocus: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
  ref?: Ref<HTMLButtonElement>
}) {
  const drag = useDragToPart(onDrop)
  const material = presetMaterial(preset.key)
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={tabStop ? 0 : -1}
      aria-pressed={current}
      aria-disabled={disabled || undefined}
      aria-describedby={hintId}
      title={disabled ? "Select parts first (or drag onto a part)" : preset.name}
      className={cn(
        "flex min-w-0 flex-col items-center gap-0.5 rounded-md p-1 text-xs outline-none",
        "hover:bg-accent-subtle focus-visible:ring-2 focus-visible:ring-ring",
        current && "bg-accent text-accent-foreground"
      )}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onLostPointerCapture={drag.onLostPointerCapture}
      onClick={() => {
        if (drag.clickAllowed() && !disabled) onApply()
      }}
    >
      {material && (
        <MaterialThumb
          appearanceKey={presetAppearanceKey(preset.key)}
          material={material}
          fallbackColor={preset.look.color}
          sizePx={THUMB_PX}
          className="pointer-events-none"
        />
      )}
      <span className="w-full truncate text-center">{preset.name}</span>
    </button>
  )
}
