import {
  Ban,
  Box,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  Link2,
  Lock,
  MoveVertical,
  Orbit,
  Pin,
  RotateCw,
  TriangleAlert,
} from "lucide-react"
import { ISSUE_TEXT } from "@/core/assembly/mateNames"
import type { SceneTreeNode } from "@/core/scene/sceneTree"
import type { VisibleRow } from "@/core/scene/treeNav"
import { cn } from "@/lib/utils"

/** The row's icon: a folder, a part, the Mates folder, or a mate by its type. */
function RowIcon({ node }: { node: SceneTreeNode }) {
  const props = { className: "size-3.5 shrink-0", "aria-hidden": true } as const
  if (node.kind === "group") return <Folder {...props} />
  if (node.kind === "part") return <Box {...props} />
  if (node.kind === "mates") return <Link2 {...props} />
  if (node.type === "fixed") return <Lock {...props} />
  if (node.type === "revolute") return <RotateCw {...props} />
  if (node.type === "prismatic") return <MoveVertical {...props} />
  return <Orbit {...props} />
}
const dofText = (dof: number | "floating") => (dof === "floating" ? "floating" : `${dof} DOF`)

interface SceneTreeRowProps {
  row: VisibleRow
  selected: boolean
  /** The one row in the tab order (roving tabindex). */
  tabStop: boolean
  onSelect: (row: VisibleRow, additive: boolean) => void
  onToggleExpanded: (id: string) => void
  /** Parts only: the row's eye button (mouse; the keyboard uses H). */
  onToggleVisible: (id: string) => void
  onFocusRow: (id: string) => void
  rowRef: (el: HTMLElement | null) => void
}

/** One flat treeitem; nesting is conveyed by aria-level/posinset/setsize, not DOM structure. */
export function SceneTreeRow(props: SceneTreeRowProps) {
  const {
    row,
    selected,
    tabStop,
    onSelect,
    onToggleExpanded,
    onToggleVisible,
    onFocusRow,
    rowRef,
  } = props
  const { node } = row
  const hidden = node.kind === "part" && node.hidden === true
  const grounded = node.kind === "part" && node.grounded === true
  const issues = node.kind === "mate" ? node.issues : []
  const suppressed = issues.includes("suppressed")
  const warnings = issues.filter((i) => i !== "suppressed" && i !== "closesLoop")
  const dimmed = (hidden || suppressed) && !selected
  const EyeIcon = hidden ? EyeOff : Eye
  const Chevron = row.expanded ? ChevronDown : ChevronRight
  // Muted only on the plain row: on accent (4.15:1) and the hover tint (4.46:1) it fails AA.
  const muted = !selected && "text-muted-foreground group-hover/row:text-accent-foreground"

  return (
    <li
      ref={rowRef}
      role="treeitem"
      tabIndex={tabStop ? 0 : -1}
      // The Mates folder only opens and closes: not selectable.
      aria-selected={node.kind === "mates" ? undefined : selected}
      aria-level={row.level}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      data-node-id={node.id}
      className={cn(
        "group/row flex h-7 cursor-default items-center gap-0.5 rounded-sm pr-1 text-sm outline-none",
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
      <RowIcon node={node} />
      <span className={cn("ml-1 flex-1 truncate", dimmed && muted)} title={node.name}>
        {node.name}
        {hidden && <span className="sr-only"> (hidden)</span>}
        {grounded && <span className="sr-only"> (grounded)</span>}
        {node.kind === "part" && node.dof !== undefined && (
          <span className="sr-only"> ({dofText(node.dof)})</span>
        )}
        {issues.map((i) => (
          <span key={i} className="sr-only">
            {" "}
            {ISSUE_TEXT[i]}
          </span>
        ))}
      </span>
      {node.kind === "part" && node.dof !== undefined && (
        <span aria-hidden className={cn("shrink-0 px-1 text-xs tabular-nums", muted)}>
          {dofText(node.dof)}
        </span>
      )}
      {suppressed && <Ban className="size-3 shrink-0" aria-hidden />}
      {warnings.length > 0 && (
        <span title={warnings.map((w) => ISSUE_TEXT[w]).join(" ")} className="shrink-0">
          <TriangleAlert className="size-3.5 text-warning" aria-hidden />
        </span>
      )}
      {grounded && <Pin className="size-3 shrink-0" aria-hidden />}
      {node.kind === "part" && (
        // Mouse-only like the chevron; shown on hover, and always while the part is hidden.
        <span
          aria-hidden
          title={hidden ? "Show" : "Hide"}
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-sm hover:bg-background/60",
            !hidden && "invisible group-hover/row:visible"
          )}
          onClick={(e) => {
            e.stopPropagation()
            onToggleVisible(node.id)
          }}
        >
          <EyeIcon className="size-3.5" />
        </span>
      )}
    </li>
  )
}
