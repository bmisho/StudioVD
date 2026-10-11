import { MeshStandardMaterial } from "three"
import { readSceneTokens } from "../theme/sceneTokens"

let shared: MeshStandardMaterial | null = null

/** Neutral material for parts without one (Phase 6 replaces this with the material library). */
export function defaultPartMaterial(): MeshStandardMaterial {
  shared ??= new MeshStandardMaterial({
    color: readSceneTokens().partDefault,
    metalness: 0,
    roughness: 0.55,
  })
  return shared
}
