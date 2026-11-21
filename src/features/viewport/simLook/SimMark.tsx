import { Html } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useMemo, useRef } from "react"
import {
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Group,
} from "three"
import type { Mark } from "@/core/bindings/visuals"
import { fromFrame } from "@/core/math/rigid"
import { jointReadings } from "@/features/physics/jointReadings"
import { noRaycast } from "../picking/pickTarget"
import { readSceneTokens } from "../theme/sceneTokens"
import { OVERLAY } from "../thumbnail/overlay"

const shared = { arrow: null as MeshBasicMaterial | null, ghost: null as MeshBasicMaterial | null }
const materials = () => {
  const tokens = readSceneTokens()
  shared.arrow ??= new MeshBasicMaterial({
    color: tokens.simHot,
    toneMapped: false,
    transparent: true,
  })
  shared.ghost ??= new MeshBasicMaterial({
    color: tokens.highlight,
    toneMapped: false,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  })
  return { arrow: shared.arrow, ghost: shared.ghost }
}

/** An arrow along the frame's z, `length` mm long (negative points back). */
function Arrow({ length }: { length: number }) {
  const m = materials()
  const l = Math.abs(length)
  const head = Math.min(l * 0.3, 8)
  return (
    <group rotation={[length >= 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0]} userData={OVERLAY}>
      <mesh
        position={[0, (l - head) / 2, 0]}
        material={m.arrow}
        raycast={noRaycast}
        userData={OVERLAY}
        renderOrder={1}
      >
        <cylinderGeometry args={[0.8, 0.8, Math.max(l - head, 0.01), 12]} />
      </mesh>
      <mesh
        position={[0, l - head / 2, 0]}
        material={m.arrow}
        raycast={noRaycast}
        userData={OVERLAY}
        renderOrder={1}
      >
        <coneGeometry args={[2.4, head, 16]} />
      </mesh>
    </group>
  )
}

const axis = new Vector3()
const pivot = new Vector3()
const turn = new Quaternion()
const m1 = new Matrix4()
const m2 = new Matrix4()

/**
 * A ghost of the part at its commanded coordinate (a servo's target, PLAN 13.1): turned about,
 * or slid along, its anchor's z by the difference from where the part is now.
 */
function Ghost({ mark, geometry }: { mark: Mark; geometry: BufferGeometry }) {
  const group = useRef<Group>(null)
  const { originMm, z } = mark.frame
  useFrame(() => {
    const g = group.current
    if (!g || mark.mate === undefined) return
    const now = jointReadings.get(mark.mate) ?? mark.designCoordinate ?? 0
    const delta = mark.value - now
    axis.set(z[0], z[1], z[2])
    pivot.set(originMm[0], originMm[1], originMm[2])
    if (mark.slides) g.matrix.makeTranslation(axis.multiplyScalar(delta))
    else {
      turn.setFromAxisAngle(axis, delta)
      g.matrix
        .makeTranslation(pivot)
        .multiply(m1.makeRotationFromQuaternion(turn))
        .multiply(m2.makeTranslation(pivot.negate()))
    }
    g.matrixWorldNeedsUpdate = true
  })
  return (
    <group ref={group} matrixAutoUpdate={false} userData={OVERLAY}>
      <mesh
        geometry={geometry}
        material={materials().ghost}
        raycast={noRaycast}
        userData={OVERLAY}
        renderOrder={1}
      />
    </group>
  )
}

/** One arrow, label or ghost on a part (PLAN 13.1 sinks), in the part's own frame. */
export function SimMark({ mark, geometry }: { mark: Mark; geometry: BufferGeometry }) {
  const placed = useMemo(() => fromFrame(mark.frame), [mark.frame])
  if (mark.kind === "ghost") return <Ghost mark={mark} geometry={geometry} />
  return (
    <group position={placed.t} quaternion={placed.q} userData={OVERLAY}>
      {mark.kind === "arrow" && Math.abs(mark.value) > 0.01 && <Arrow length={mark.value} />}
      {mark.kind === "label" && (
        <Html center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <span className="rounded-sm border bg-background px-1 text-xs whitespace-nowrap text-foreground tabular-nums">
            {mark.text}
          </span>
        </Html>
      )}
    </group>
  )
}
