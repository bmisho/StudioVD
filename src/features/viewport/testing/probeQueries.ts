import type { RootState } from "@react-three/fiber"
import { Box3, Vector2, Vector3, type Object3D } from "three"
import { partObject } from "../parts/partObjects"
import { pickRefOf } from "../picking/pickTarget"
import type { ClientPoint, PartPoseState } from "./probeTypes"

// Dev-only E2E queries (ViewportProbe). They read the live scene; nothing here is app logic.

const box = new Box3()
const v = new Vector3()
const ndc = new Vector2()

function clientOf(state: RootState, world: Vector3): ClientPoint {
  const rect = state.gl.domElement.getBoundingClientRect()
  const p = world.clone().project(state.camera)
  return {
    x: rect.left + ((p.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - p.y) / 2) * rect.height,
  }
}

export function projectPoint(state: RootState, point: [number, number, number]): ClientPoint {
  state.camera.updateMatrixWorld()
  return clientOf(state, v.set(...point))
}

export function projectPart(state: RootState, id: string): ClientPoint | null {
  const object = partObject(id as Parameters<typeof partObject>[0])
  if (!object) return null
  object.updateWorldMatrix(true, true)
  state.camera.updateMatrixWorld()
  return clientOf(state, box.setFromObject(object).getCenter(v))
}

export function pickAt(state: RootState, root: Object3D | null, x: number, y: number) {
  if (!root) return null
  const rect = state.gl.domElement.getBoundingClientRect()
  ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
  state.camera.updateMatrixWorld()
  root.updateMatrixWorld() // poses may have changed since the last render
  state.raycaster.setFromCamera(ndc, state.camera)
  const hit = state.raycaster.intersectObject(root, true)[0]
  return hit ? (pickRefOf(hit.object)?.id ?? null) : null
}

export function partPose(id: string): PartPoseState | null {
  const object = partObject(id as Parameters<typeof partObject>[0])
  if (!object) return null
  const p = object.position
  const q = object.quaternion
  return { position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w] }
}
