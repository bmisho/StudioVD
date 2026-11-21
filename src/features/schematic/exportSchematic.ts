import { DOMAIN_LOOK } from "@/core/schematic/domainLook"
import { schematicSvg, type SchematicPalette } from "@/core/schematic/svg"
import type { Domain } from "@/core/schema"
import { pickExportPath, writeExport } from "@/lib/tauri/files"
import { err, ok, type Result } from "@/lib/tauri/result"
import { useDocumentStore } from "@/store/document/documentStore"

/** The theme's colours, resolved: an exported file has no stylesheet (CLAUDE.md §7 tokens). */
function palette(): SchematicPalette {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim() || "#000000"
  const domains = Object.fromEntries(
    Object.entries(DOMAIN_LOOK).map(([d, look]) => [d, token(look.token)])
  ) as Record<Domain, string>
  return {
    background: token("--background"),
    foreground: token("--foreground"),
    muted: token("--muted-foreground"),
    border: token("--input"),
    domains,
    font: "Inter Variable, Inter, system-ui, sans-serif",
  }
}

/** Largest PNG side: canvases fail silently past ~16k px, and 8k is plenty for print. */
const MAX_PNG_SIDE = 8192

/** The SVG drawn at twice its size (or less, to stay within the cap) as PNG bytes. */
async function svgToPng(svg: string): Promise<Uint8Array> {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const scale = Math.min(2, MAX_PNG_SIDE / Math.max(image.width, image.height, 1))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("No 2D canvas to draw the PNG on.")
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"))
  if (!blob) throw new Error("The PNG could not be encoded.")
  return new Uint8Array(await blob.arrayBuffer())
}

/** File › Export › Schematic (PLAN 11.8): the whole schematic as SVG or PNG. */
export async function exportSchematic(format: "svg" | "png"): Promise<Result<void>> {
  const { doc } = useDocumentStore.getState()
  const svg = schematicSvg(doc, palette())
  if (svg === null)
    return err({ kind: "invalidInput", message: "The schematic has no blocks to export." })
  const stem = doc.project.name.trim() || "schematic"
  const target = await pickExportPath(format, `${stem} schematic`)
  if (!target.ok) return target
  if (target.value === null) return ok(undefined) // cancelled
  try {
    const bytes = format === "svg" ? new TextEncoder().encode(svg) : await svgToPng(svg)
    return await writeExport(target.value.token, bytes)
  } catch (e) {
    return err({ kind: "internal", message: e instanceof Error ? e.message : String(e) })
  }
}
