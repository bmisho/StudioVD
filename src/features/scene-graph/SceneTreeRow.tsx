import { Box, ChevronDown, ChevronRight, Folder } from "lucide-react"
import type { VisibleRow } from "@/core/scene/treeNav"
import { cn } from "@/lib/utils"

interface SceneTreeRowProps {
  row: VisibleRow
  selected: boolean
  /** The one row in the tab order (roving tabindex). */
  tabStop: boolean
  onSelect: (row: VisibleRow, additive: boolean) => void
  onToggleExpanded: (id: string) => void
  onFocusRow: (id: string) => void
  rowRef: (el: HTMLElement | null) => void
}

/** One flat treeitem; nesting is conveyed by aria-level/posinset/setsize, not DOM structure. */
export function SceneTreeRow(props: SceneTreeRowProps) {
  const { row, selected, tabStop, onSelect, onToggleExpanded, onFocusRow, rowRef } = props
  const { node } = row
  const Chevron = row.expanded ? ChevronDown : ChevronRight
  const Icon = node.kind === "group" ? Folder : Box

  return (
    <li
      ref={rowRef}
      role="treeitem"
      tabIndex={tabStop ? 0 : -1}
      aria-selected={selected}
      aria-level={row.level}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      data-node-id={node.id}
      className={cn(
        "flex h-7 cursor-default items-center gap-0.5 rounded-sm pr-2 text-sm outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent-subtle"
      )}
      style={{ paddingLeft: `${(row.level - 1) * 14}px` }}
      onClick={(e) => onSelect(row, e.ctrlKey || e.metaKey)}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocusRow(node.id)
      }}
    >
      {/* Mouse-only affordance: keyboard users expand with the arrow keys (WAI-ARIA tree). */}
      <span
        aria-hidden
        className={cn("grid size-6 shrink-0 place-items-center", !row.hasChildren && "invisible")}
        onClick={(e) => {
          e.stopPropagation()
          onToggleExpanded(node.id)
        }}
      >
        <Chevron className="size-3.5" />
      </span>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="ml-1 truncate" title={node.name}>
        {node.name}
      </span>
    </li>
  )
}
