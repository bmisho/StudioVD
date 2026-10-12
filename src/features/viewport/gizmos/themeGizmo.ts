import type { Color, Material, Object3D } from "three"
import type { SceneTokens } from "../theme/sceneTokens"

type Tinted = Material & { color?: Color; tempColor?: Color; opacity: number }

const materialsOf = (o: Object3D): Tinted[] => {
  const m = (o as { material?: Material | Material[] }).material
  return m ? (Array.isArray(m) ? m : [m]) : []
}

/**
 * Gives three-stdlib's TransformControls our 3D colours (CLAUDE.md §7: 3D colours come from
 * the theme tokens). Its built-in pure red/green/blue/yellow fail 3:1 on the light viewport
 * (green 1.3:1); the axis tokens pass. It also lightens a hovered handle toward white, which
 * fades it on a light background: the hovered handle keeps its full colour instead (the
 * others still fade to a quarter).
 */
export function themeTransformControls(controls: Object3D, tokens: SceneTokens): void {
  const map = new Map<number, string>([
    [0xff0000, tokens.axisX],
    [0x00ff00, tokens.axisY],
    [0x0000ff, tokens.axisZ],
    [0x00ffff, tokens.axisX], // plane handles: the colour of the axis they face
    [0xff00ff, tokens.axisY],
    [0xffff00, tokens.highlight], // free-move centre and view-axis ring
  ])
  const seen = new Set<Material>()
  controls.traverse((o) => {
    for (const m of materialsOf(o)) {
      if (seen.has(m) || !m.color) continue
      seen.add(m)
      const token = map.get((m.tempColor ?? m.color).getHex())
      if (!token) continue
      m.color.set(token)
      m.tempColor?.set(token)
    }
  })
  for (const gizmo of controls.children) {
    const update = gizmo.updateMatrixWorld.bind(gizmo)
    gizmo.updateMatrixWorld = (force?: boolean) => {
      update(force)
      gizmo.traverse((o) => {
        for (const m of materialsOf(o)) {
          if (m.tempColor && m.color && m.opacity === 1) m.color.copy(m.tempColor)
        }
      })
    }
  }
}
