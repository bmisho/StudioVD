// Test helper (not app code): an R3F root as the 3D view runs it, minus WebGL.
import { createRoot, extend } from "@react-three/fiber"
import { act, type ReactNode } from "react"
import * as THREE from "three"
import { vi } from "vitest"

extend(THREE as never)

/** Lets React finish what an act() started (R3F commits its tree asynchronously). */
export const settle = () => act(async () => {})

type RootStore = ReturnType<ReturnType<typeof createRoot>["render"]>

/**
 * An R3F root with the app's demand frameloop on a stand-in renderer (jsdom has no WebGL),
 * counting the frames requested: in the demand frameloop, what decides whether a change
 * reaches the screen at all.
 */
export async function demandRoot(scene: ReactNode) {
  const canvas = document.createElement("canvas")
  const root = createRoot(canvas)
  const gl = {
    domElement: canvas,
    render: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    getPixelRatio: () => 1,
    shadowMap: { enabled: false, type: 0 },
  }
  await root.configure({
    gl: gl as never,
    frameloop: "demand",
    size: { width: 500, height: 500, top: 0, left: 0 },
  })
  let store: RootStore | undefined
  act(() => {
    store = root.render(scene)
  })
  await settle()
  if (!store) throw new Error("the R3F root did not render")
  const invalidate = vi.fn()
  store.setState({ invalidate })
  // Counts subscriptions to the root store taken from here on and not yet released.
  let live = 0
  const subscribe = store.subscribe
  store.subscribe = (listener) => {
    live++
    const unsubscribe = subscribe(listener)
    return () => {
      live--
      unsubscribe()
    }
  }
  return {
    store,
    subscriptions: () => live,
    /** Frames requested while `change` runs and React commits it. */
    framesRequested: async (change: () => void) => {
      const before = invalidate.mock.calls.length
      act(() => change())
      await settle()
      return invalidate.mock.calls.length - before
    },
    unmount: async () => {
      act(() => root.unmount())
      await settle()
    },
  }
}

/** Every theme token as one colour: jsdom loads no stylesheet (use inside vi.mock). */
export const flatSceneTokens = () => new Proxy({}, { get: () => "#0ea5e9" })
