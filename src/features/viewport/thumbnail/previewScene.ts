import {
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
} from "three"
import { CAMERA_FOV_DEG } from "../camera/cameraConfig"
import { createGradientTexture } from "../renderer/gradientTexture"
import { STUDIO_LIGHTING } from "../scene/lightingPreset"
import { readSceneTokens } from "../theme/sceneTokens"

/** The sphere's diameter as a share of the tile (flat swatches draw the same disc). */
export const PREVIEW_SPHERE_FILL = 0.8
/** A 40 mm ball: glass thickness is in mm, so it refracts as it does on a part that size. */
const RADIUS_MM = 20

export interface PreviewScene {
  scene: Scene
  camera: PerspectiveCamera
  sphere: Mesh
  /** What the sphere holds between renders, so it keeps no document material alive. */
  idle: MeshBasicMaterial
}

let preview: PreviewScene | null = null

function create(): PreviewScene {
  const tokens = readSceneTokens()
  const scene = new Scene()
  // Something for glass to refract: without it the transmission pass sees white at half alpha.
  scene.background = createGradientTexture(tokens.viewportTop, tokens.viewportBottom)
  scene.add(new HemisphereLight(tokens.surface, tokens.viewportBottom, STUDIO_LIGHTING.hemisphere))
  // The camera looks down -Z unrotated, so the viewport's camera-space light directions are
  // world directions here: the same three-quarter key light parts get (SceneLighting).
  for (const { intensity, cameraDir } of [STUDIO_LIGHTING.key, STUDIO_LIGHTING.fill]) {
    const light = new DirectionalLight(0xffffff, intensity)
    const [x, y, z] = cameraDir
    light.position.set(x, y, z).normalize()
    scene.add(light)
  }
  const idle = new MeshBasicMaterial()
  const sphere = new Mesh(new SphereGeometry(RADIUS_MM, 64, 32), idle)
  scene.add(sphere)
  // A centred sphere's silhouette subtends asin(r / d); place it to fill PREVIEW_SPHERE_FILL.
  const halfFov = (CAMERA_FOV_DEG / 2) * (Math.PI / 180)
  const distance = RADIUS_MM / Math.sin(Math.atan(PREVIEW_SPHERE_FILL * Math.tan(halfFov)))
  const camera = new PerspectiveCamera(
    CAMERA_FOV_DEG,
    1,
    distance - 2 * RADIUS_MM,
    distance + 2 * RADIUS_MM
  )
  camera.position.set(0, 0, distance)
  return { scene, camera, sphere, idle }
}

/**
 * The material preview stage (PLAN 6.3): a sphere under the studio light rig, drawn by the
 * viewport's own renderer. Built once and kept for the app's lifetime: it holds no GPU
 * resource of its own that a new renderer could not upload again.
 */
export function previewScene(): PreviewScene {
  preview ??= create()
  return preview
}
