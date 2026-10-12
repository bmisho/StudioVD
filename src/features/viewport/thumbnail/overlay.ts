import type { Object3D } from "three"

/** `userData` for scene helpers that are not the assembly (grid, highlights, gizmos). */
export const OVERLAY = Object.freeze({ overlay: true })

/** Drawn for editing, left out of thumbnails. three-stdlib's TransformControls flags itself. */
export const isOverlay = (object: Object3D): boolean =>
  object.userData.overlay === true ||
  (object as Object3D & { isTransformControls?: boolean }).isTransformControls === true
