import { useEffect, useRef, useState } from "react"
import { usePanelRef } from "react-resizable-panels"

interface Options {
  /** Restore in pixels (sidebars keep their width) or percent (split panes keep their ratio). */
  unit?: "px" | "%"
  /** Called when the user collapses or re-opens the panel by dragging its separator. */
  onDragToggle?: (open: boolean) => void
}

/**
 * Drives a collapsible panel from state instead of mounting/unmounting it (CLAUDE.md §4:
 * layout toggles never remount panes; the 3D canvas lives in one). Returns the ref to pass as
 * `panelRef`, an `onResize` handler, and whether the panel is currently collapsed, which also
 * catches collapses made by dragging the separator.
 */
export function useCollapsiblePanel(open: boolean, { unit = "%", onDragToggle }: Options = {}) {
  const panelRef = usePanelRef()
  const [collapsed, setCollapsed] = useState(!open)
  const sizeBeforeCollapse = useRef<string | null>(null)

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    if (!open && !panel.isCollapsed()) {
      const { inPixels, asPercentage } = panel.getSize()
      sizeBeforeCollapse.current = unit === "px" ? `${inPixels}px` : `${asPercentage}%`
      panel.collapse()
    }
    if (open && panel.isCollapsed()) {
      // expand() alone forgets the size once the group changes orientation and falls back
      // to minSize, so restore the remembered size when we collapsed it ourselves.
      if (sizeBeforeCollapse.current) panel.resize(sizeBeforeCollapse.current)
      else panel.expand()
      sizeBeforeCollapse.current = null
    }
  }, [open, panelRef, unit])

  const onResize = () => {
    const isCollapsed = panelRef.current?.isCollapsed() ?? false
    setCollapsed(isCollapsed)
    if (onDragToggle && isCollapsed === open) onDragToggle(!isCollapsed)
  }

  return { panelRef, onResize, collapsed }
}
