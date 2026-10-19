import type { Material } from "three"
import type { Direction } from "@/core/math/standardViews"
import type { PartId } from "@/core/schema"

/**
 * How commands reach the 3D view without depending on R3F. The canvas attaches an
 * implementation while it exists; until then (or while the pane has never had a size, so
 * R3F has no root) the view commands are disabled. Transient, not Zustand.
 */
export interface ViewportApi {
  isReady(): boolean
  fitAll(animate?: boolean): void
  /**
   * Fit-all on the next rendered frame, once a document change has reached the scene (a
   * command that inserts parts runs before React has mounted them).
   */
  fitAllAfterChange(): void
  /** Looks along `direction` (from the target towards the camera). */
  setView(direction: Direction): void
  /** A PNG of the assembly for the project bundle (PLAN 5.5); null when it cannot render. */
  captureThumbnail(): Promise<Uint8Array | null>
  /** The part drawn under a point of the page (client px), if any. */
  partAt(clientX: number, clientY: number): PartId | null
  /**
   * Sphere previews of three.js materials, `tilePx` device px square, in order (PLAN 6.3).
   * Async: shaders compile first without blocking. Null when it cannot render now.
   */
  renderMaterialPreviews(
    materials: readonly Material[],
    tilePx: number
  ): Promise<ImageData[] | null>
}

export interface ViewportImpl {
  fitAll(animate: boolean): void
  fitAllNextFrame(animate: boolean): void
  setView(direction: Direction, animate: boolean): void
  captureThumbnail(): Promise<Uint8Array | null>
  partAt(clientX: number, clientY: number): PartId | null
  renderMaterialPreviews(
    materials: readonly Material[],
    tilePx: number
  ): Promise<ImageData[] | null>
}

const prefersMotion = () =>
  typeof window === "undefined" ||
  typeof window.matchMedia !== "function" ||
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function createViewportBridge(): ViewportApi & { attach(impl: ViewportImpl): () => void } {
  let current: ViewportImpl | null = null
  return {
    isReady: () => current !== null,
    fitAll: (animate = prefersMotion()) => current?.fitAll(animate),
    fitAllAfterChange: () => current?.fitAllNextFrame(prefersMotion()),
    setView: (direction) => current?.setView(direction, prefersMotion()),
    captureThumbnail: async () => (current ? current.captureThumbnail() : null),
    partAt: (x, y) => current?.partAt(x, y) ?? null,
    renderMaterialPreviews: async (materials, tilePx) =>
      current ? current.renderMaterialPreviews(materials, tilePx) : null,
    attach(impl) {
      current = impl
      return () => {
        if (current === impl) current = null
      }
    },
  }
}

export const viewportBridge = createViewportBridge()
