import type { RootState } from "@react-three/fiber"

/**
 * Draws the normal frame now, in this task: after drawing something else into the canvas
 * (a thumbnail, previews), which the canvas would otherwise show, or to read real pixels.
 *
 * R3F's manual `advance` runs the frame callbacks outside its loop, so an `invalidate` they
 * make (camera-controls asks for the next frame while a transition or damping still moves
 * the camera) is counted down at the end of that frame and the demand loop stops: the view
 * would freeze mid-move. Invalidating again keeps the loop going; when nothing moves, that is
 * one extra frame.
 */
export function redrawNow(state: Pick<RootState, "advance" | "invalidate">): void {
  state.advance(performance.now())
  state.invalidate()
}
