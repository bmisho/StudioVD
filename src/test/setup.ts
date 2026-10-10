import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => cleanup())

// jsdom lacks browser APIs that Radix primitives and react-resizable-panels call.
// Guarded: files marked `@vitest-environment node` share this setup.
if (typeof window !== "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub
  const polyfill = (name: string, value: () => unknown) => {
    if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { value, configurable: true, writable: true })
    }
  }
  polyfill("scrollIntoView", () => undefined)
  polyfill("hasPointerCapture", () => false)
  polyfill("setPointerCapture", () => undefined)
  polyfill("releasePointerCapture", () => undefined)
  if (!("matchMedia" in window)) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
}
