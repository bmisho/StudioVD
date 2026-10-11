import { Box3, Vector3 } from "three"

/** Vertical field of view: narrow, so perspective stays close to orthographic (less distortion). */
export const CAMERA_FOV_DEG = 30
export const MIN_DISTANCE_MM = 0.5
export const MAX_DISTANCE_MM = 100_000
/** Fit-all margin per side, as a fraction of the frustum. */
export const FIT_PADDING = 0.05
/** far/near cap: about 1 px of depth error at `far` with a 24-bit depth buffer. */
export const CLIP_MAX_RATIO = 1e4
export const MIN_NEAR_MM = 0.01
/** R3F's frame delta is the time since the last rendered frame: seconds after an idle spell. */
export const MAX_FRAME_DELTA_S = 1 / 30
export const SMOOTH_TIME_S = 0.2
export const DRAG_SMOOTH_TIME_S = 0.05
export const CLICK_SLOP_PX = 4
export const DOUBLE_CLICK_MS = 500
/** What Fit All frames in an empty scene. */
export const DEFAULT_STAGE = new Box3(new Vector3(-100, 0, -100), new Vector3(100, 100, 100))
/** Isometric: direction from the target to the camera. */
export const HOME_DIRECTION = new Vector3(1, 1, 1).normalize()
