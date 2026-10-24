import { useMemo, type Ref } from "react"
import { Matrix4, Quaternion, Vector3, type Group } from "three"
import type { AnchorKind, Frame } from "@/core/schema"
import { noRaycast } from "@/features/viewport/picking/pickTarget"
import { useRedrawOnRemoval } from "@/features/viewport/renderer/useRedrawOnRemoval"
import { OVERLAY } from "@/features/viewport/thumbnail/overlay"
import { GLYPH_ORDER, glyphParts } from "./glyphParts"

const HALF_TURN_X: [number, number, number] = [Math.PI / 2, 0, 0] // +Y (built) -> +Z
const QUARTER_TURN_Z: [number, number, number] = [0, 0, -Math.PI / 2] // +Y (built) -> +X

/** The frame's rotation as a quaternion (columns x, y = z × x, z). */
function frameQuaternion(frame: Frame): Quaternion {
  const x = new Vector3(...frame.x)
  const z = new Vector3(...frame.z)
  const y = new Vector3().crossVectors(z, x)
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
}

/**
 * One anchor's triad (PLAN 7.4): a dot at the origin, z as an arrow and x as a short red
 * line; a planar anchor adds a square in its plane, an axial one its axis through the dot and
 * a ring around it. Drawn in CSS px: GlyphScaler scales the group registered through `ref`.
 * `ghost`: the see-through Place Anchor preview. `selected`: a third larger.
 */
export function AnchorGlyph({
  frame,
  kind,
  ghost = false,
  selected = false,
  ref,
}: {
  frame: Frame
  kind: AnchorKind
  ghost?: boolean
  selected?: boolean
  ref?: Ref<Group>
}) {
  const p = glyphParts()
  const g = p.geometry
  const main = ghost ? p.mainGhost : p.main
  const quaternion = useMemo(() => frameQuaternion(frame), [frame])
  useRedrawOnRemoval(kind) // the plate or axis of the old kind goes
  const mesh = { raycast: noRaycast, renderOrder: GLYPH_ORDER, userData: OVERLAY }
  return (
    <group position={frame.originMm} quaternion={quaternion} userData={OVERLAY}>
      <group ref={ref}>
        <group scale={selected ? 1.35 : 1}>
          <mesh geometry={g.dot} material={main} {...mesh} />
          <mesh geometry={g.shaft} material={main} rotation={HALF_TURN_X} {...mesh} />
          <mesh geometry={g.head} material={main} rotation={HALF_TURN_X} {...mesh} />
          <mesh geometry={g.xShaft} material={p.x} rotation={QUARTER_TURN_Z} {...mesh} />
          {kind === "planar" && <mesh geometry={g.plate} material={p.plate} {...mesh} />}
          {kind === "axial" && (
            <>
              <mesh geometry={g.ring} material={main} {...mesh} />
              <mesh geometry={g.shaft} material={main} rotation={[-Math.PI / 2, 0, 0]} {...mesh} />
            </>
          )}
        </group>
      </group>
    </group>
  )
}
