import { useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  TextureSchema,
  type MapKind,
  type MaterialId,
  type SceneDocument,
  type TextureMap,
} from "@/core/schema"
import { toastNotifier } from "@/lib/notify"
import { importTexture } from "@/lib/tauri/files"
import { useDocumentStore } from "@/store/document/documentStore"
import { NumberField } from "./NumberField"

/** Tile size of a new map, and TextureMapSchema's bounds for it. */
const DEFAULT_TILE_MM = 50
const TILE_MIN_MM = 0.01
const TILE_MAX_MM = 1e5
const clampTile = (typed: number) =>
  Number.isFinite(typed) ? Math.min(TILE_MAX_MM, Math.max(TILE_MIN_MM, typed)) : null

const TILE_HINT = "How much of the part one repeat of the image covers."

const mapOf = (doc: SceneDocument, id: MaterialId, kind: MapKind): TextureMap | undefined =>
  Object.hasOwn(doc.materials, id) ? doc.materials[id]?.maps?.[kind] : undefined

/**
 * One texture map of a material (PLAN 6.3): choose an image (Rust runs the dialog and checks
 * the file), its tile size, or remove it. The document stores only the content address, so
 * the map is shown by a short form of it.
 */
export function TextureMapField({
  materialId,
  kind,
  label,
}: {
  materialId: MaterialId
  kind: MapKind
  label: string
}) {
  const id = useId()
  const map = useDocumentStore((s) => mapOf(s.doc, materialId, kind))
  const setMaterialMap = useDocumentStore((s) => s.setMaterialMap)
  const [busy, setBusy] = useState(false)
  const choosing = useRef(false) // set at once: a second click lands before the re-render
  const chooseButton = useRef<HTMLButtonElement>(null)

  const choose = async () => {
    if (choosing.current) return
    choosing.current = true
    setBusy(true)
    const result = await importTexture()
    choosing.current = false
    setBusy(false)
    if (!result.ok) {
      toastNotifier.error("Could not add the image", result.error.message)
      return
    }
    const image = result.value
    if (image === null) return // cancelled
    // Narrowed by the schema, not cast: the id must be the image's SHA-256.
    const path = `textures/${image.id}.${image.ext}`
    const texture = TextureSchema.safeParse({ id: image.id, path })
    if (!texture.success) {
      toastNotifier.error("Could not add the image", "It came back without a valid checksum.")
      return
    }
    // Replacing an image keeps the tile size; the material may be gone by now (undo).
    const current = mapOf(useDocumentStore.getState().doc, materialId, kind)
    const tileSizeMm = current?.tileSizeMm ?? DEFAULT_TILE_MM
    setMaterialMap(materialId, kind, { textureId: texture.data.id, tileSizeMm }, texture.data)
  }

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span id={`${id}-label`} className="font-medium">
          {label}
        </span>
        <span className="truncate text-muted-foreground tabular-nums">
          {map ? `Image ${map.textureId.slice(0, 8)}` : "None"}
        </span>
      </div>
      {map && (
        <div className="grid grid-cols-[6rem_minmax(0,1fr)_4.5rem] items-center gap-x-2">
          <Label
            htmlFor={`${id}-tile`}
            className="col-span-2 block truncate text-xs"
            title={TILE_HINT}
          >
            Tile size (mm)
          </Label>
          <NumberField
            id={`${id}-tile`}
            value={map.tileSizeMm}
            clamp={clampTile}
            onChange={(tileSizeMm) => setMaterialMap(materialId, kind, { ...map, tileSizeMm })}
            aria-describedby={`${id}-tile-hint`}
          />
          <span id={`${id}-tile-hint`} className="sr-only">
            {TILE_HINT}
          </span>
        </div>
      )}
      <div className="flex gap-1.5">
        <Button
          ref={chooseButton}
          variant="outline"
          size="sm"
          className="h-7 text-xs aria-disabled:opacity-50"
          aria-disabled={busy || undefined}
          onClick={() => void choose()}
        >
          {map ? "Replace image…" : "Choose image…"}
        </Button>
        {map && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setMaterialMap(materialId, kind, null)
              chooseButton.current?.focus() // this button is gone now
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}
