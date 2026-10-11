import type { CameraControlsImpl } from "@react-three/drei"
import type { Vector3 } from "three"
import { isClick, isDoubleClick, type PointerSample } from "@/core/navigation/clickGesture"
import {
  resolveButtons,
  type MouseButtonName,
  type NavigationPreset,
} from "@/core/navigation/mousePresets"
import { applyButtons } from "./applyNavigation"
import { CLICK_SLOP_PX, DOUBLE_CLICK_MS } from "./cameraConfig"

export interface NavigationInputOptions {
  getPreset: () => NavigationPreset
  /** Surface point under the cursor, for presets that orbit around it. */
  pickPoint: (clientX: number, clientY: number) => Vector3 | null
  onMiddleDoubleClick: () => void
  onContextMenuRequest: (clientX: number, clientY: number) => void
}

const BUTTON_NAMES: readonly (MouseButtonName | undefined)[] = ["left", "middle", "right"]
const sample = (e: MouseEvent): PointerSample => ({ x: e.clientX, y: e.clientY, t: e.timeStamp })

/**
 * Mouse handling around camera-controls, attached to the element it is connected to.
 * Capture-phase listeners run before camera-controls' own (bubble) listeners, so:
 * - modifiers are resolved once at pointerdown and stay latched for the whole drag
 *   (camera-controls re-reads mouseButtons on every move);
 * - the native context menu never opens, R3F does not treat a right-click as a click on
 *   empty space, and camera-controls keeps its controlstart/controlend pairs;
 * - Ctrl+wheel (also a touchpad pinch) becomes a normal zoom instead of a lens zoom.
 */
export function attachNavigationInput(
  el: HTMLElement,
  controls: CameraControlsImpl,
  o: NavigationInputOptions
): () => void {
  const downs = new Map<number, PointerSample>()
  let lastMiddleClick: PointerSample | null = null

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return
    const preset = o.getPreset()
    const buttons = resolveButtons(preset, { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey })
    applyButtons(controls, buttons)
    downs.set(e.button, sample(e))
    const name = BUTTON_NAMES[e.button]
    if (name && buttons[name] === "orbit" && preset.orbitPivot === "cursor") {
      const hit = o.pickPoint(e.clientX, e.clientY)
      if (hit) {
        controls.stop()
        controls.setOrbitPoint(hit.x, hit.y, hit.z)
      }
    }
    // Middle-press autoscroll (WebView2) starts from the compatibility mousedown.
    if (e.button === 1) e.preventDefault()
  }

  const onPointerUp = (e: PointerEvent) => {
    const down = downs.get(e.button)
    downs.delete(e.button)
    if (e.pointerType !== "mouse" || !down) return
    const up = sample(e)
    if (!isClick(down, up, CLICK_SLOP_PX)) return
    if (e.button === 1) {
      const fits = o.getPreset().middleDoubleClickFits
      if (fits && isDoubleClick(lastMiddleClick, up, DOUBLE_CLICK_MS, CLICK_SLOP_PX)) {
        lastMiddleClick = null
        o.onMiddleDoubleClick()
      } else {
        lastMiddleClick = up
      }
    } else if (e.button === 2) {
      // Linux fires contextmenu at the press, Windows at the release: decide on release.
      o.onContextMenuRequest(e.clientX, e.clientY)
    }
  }

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    e.stopPropagation()
    el.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        ctrlKey: false,
        bubbles: true,
        cancelable: true,
      })
    )
  }

  // Alt+Tab in the middle of a drag must not leave the drag stuck.
  const onBlur = () => {
    downs.clear()
    controls.cancel()
  }

  el.addEventListener("pointerdown", onPointerDown, { capture: true })
  window.addEventListener("pointerup", onPointerUp, { capture: true })
  el.addEventListener("contextmenu", onContextMenu, { capture: true })
  el.addEventListener("wheel", onWheel, { capture: true, passive: false })
  window.addEventListener("blur", onBlur)
  return () => {
    el.removeEventListener("pointerdown", onPointerDown, { capture: true })
    window.removeEventListener("pointerup", onPointerUp, { capture: true })
    el.removeEventListener("contextmenu", onContextMenu, { capture: true })
    el.removeEventListener("wheel", onWheel, { capture: true })
    window.removeEventListener("blur", onBlur)
  }
}
