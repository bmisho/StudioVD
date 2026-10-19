import type { RootState } from "@react-three/fiber"
import { Group, Mesh, Vector4, type Material, type Scene, type WebGLRenderer } from "three"
import { toImagePixels } from "./encodeThumbnail"
import { previewScene, type PreviewScene } from "./previewScene"

/** Longest wait for shaders before rendering anyway (a lost context never reports them ready). */
const COMPILE_WAIT_MS = 3000
/**
 * setViewport rounds logical px x pixel ratio, while setRenderTarget(null) (after a glass
 * pass) floors them: a quarter device pixel in, both land on the same pixel.
 */
const NUDGE_PX = 0.25

export interface TileLayout {
  columns: number
  /** Tiles that fit in the drawing buffer at once. */
  perBatch: number
}

/** How `tilePx` tiles fill a drawing buffer, row by row from its lower-left corner. */
export function tileLayout(width: number, height: number, tilePx: number): TileLayout | null {
  const columns = Math.floor(width / tilePx)
  const rows = Math.floor(height / tilePx)
  return columns > 0 && rows > 0 ? { columns, perBatch: columns * rows } : null
}

/** Lower-left corner of tile `i` in drawing-buffer pixels (GL: y up). */
export const tileOrigin = (i: number, columns: number, tilePx: number) => ({
  x: (i % columns) * tilePx,
  y: Math.floor(i / columns) * tilePx,
})

/** One tile out of a block read at (0, 0) `blockWidth` px wide, as ImageData pixels. */
export function cutTile(
  px: Uint8Array,
  blockWidth: number,
  tilePx: number,
  x: number,
  y: number
): Uint8ClampedArray<ArrayBuffer> {
  const row = tilePx * 4
  const tile = new Uint8Array(row * tilePx)
  for (let r = 0; r < tilePx; r++) {
    const start = ((y + r) * blockWidth + x) * 4
    tile.set(px.subarray(start, start + row), r * row)
  }
  return toImagePixels(tile, tilePx, tilePx)
}

/** Lights metals with the viewport's own studio environment; false while it is not built. */
function syncEnvironment(preview: Scene, main: Scene): boolean {
  if (!main.environment) return false
  preview.environment = main.environment
  preview.environmentIntensity = main.environmentIntensity
  preview.environmentRotation.copy(main.environmentRotation)
  return true
}

/** Compiles every program first, in parallel, where KHR_parallel_shader_compile exists. */
async function compileAll(gl: WebGLRenderer, stage: PreviewScene, materials: readonly Material[]) {
  // Without the extension three would only warn and compile on the first render anyway.
  if (!gl.extensions.has("KHR_parallel_shader_compile")) return
  const group = new Group()
  for (const material of materials) group.add(new Mesh(stage.sphere.geometry, material))
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, COMPILE_WAIT_MS)
  })
  try {
    await Promise.race([gl.compileAsync(group, stage.camera, stage.scene), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Renders one batch as tiles, reads them in one call, and cuts them apart. */
function renderBatch(
  gl: WebGLRenderer,
  stage: PreviewScene,
  materials: readonly Material[],
  layout: TileLayout,
  tilePx: number
): ImageData[] {
  const ctx = gl.getContext()
  const logical = (v: number) => (v + NUDGE_PX) / gl.getPixelRatio()
  const size = logical(tilePx)
  materials.forEach((material, i) => {
    const { x, y } = tileOrigin(i, layout.columns, tilePx)
    gl.setViewport(logical(x), logical(y), size, size)
    gl.setScissor(logical(x), logical(y), size, size)
    stage.sphere.material = material
    gl.render(stage.scene, stage.camera)
  })
  const width = Math.min(materials.length, layout.columns) * tilePx
  const height = Math.ceil(materials.length / layout.columns) * tilePx
  const px = new Uint8Array(width * height * 4)
  ctx.readPixels(0, 0, width, height, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
  return materials.map((_, i) => {
    const { x, y } = tileOrigin(i, layout.columns, tilePx)
    return new ImageData(cutTile(px, width, tilePx, x, y), tilePx, tilePx)
  })
}

/**
 * Sphere previews of `materials` (PLAN 6.3), `tilePx` device pixels square, top row first,
 * straight alpha. Drawn by the viewport's renderer into its own canvas, tile by tile with the
 * scissor (as many batches as the drawing buffer needs), and read in the same task: the
 * canvas does not preserve its drawing buffer, and the default framebuffer applies tone
 * mapping and the output colour space exactly as on screen (a render target would not).
 * Then the normal frame is drawn again, so nothing flickers. Null when it cannot render: a
 * lost context, a buffer smaller than one tile, the studio environment not built yet.
 */
export async function renderMaterialPreviews(
  state: RootState,
  materials: readonly Material[],
  tilePx: number
): Promise<ImageData[] | null> {
  if (materials.length === 0) return []
  const { gl } = state
  const stage = previewScene()
  if (!syncEnvironment(stage.scene, state.scene)) return null
  await compileAll(gl, stage, materials)

  // Checked after the wait: the context, the pane size or the environment may have changed.
  const ctx = gl.getContext()
  const layout = tileLayout(ctx.drawingBufferWidth, ctx.drawingBufferHeight, tilePx)
  if (ctx.isContextLost() || !layout || !syncEnvironment(stage.scene, state.scene)) return null
  const viewport = gl.getViewport(new Vector4())
  const scissor = gl.getScissor(new Vector4())
  const scissorTest = gl.getScissorTest()
  const out: ImageData[] = []
  try {
    gl.setScissorTest(true)
    for (let start = 0; start < materials.length; start += layout.perBatch) {
      const batch = materials.slice(start, start + layout.perBatch)
      out.push(...renderBatch(gl, stage, batch, layout, tilePx))
    }
  } finally {
    stage.sphere.material = stage.idle
    gl.setViewport(viewport)
    gl.setScissor(scissor)
    gl.setScissorTest(scissorTest)
    state.advance(performance.now())
  }
  return ctx.isContextLost() ? null : out
}
