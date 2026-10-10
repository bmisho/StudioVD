import { useState } from "react"
import { Box, ChevronDown, ChevronRight, Folder } from "lucide-react"
import type { SceneTreeNode } from "@/core/scene/sceneTree"
import { cn } from "@/lib/utils"
import { useSessionStore, type SelectionItem } from "@/store/session/sessionStore"

interface SceneTreeRowProps {
  node: SceneTreeNode
  level: number
}

function isSelected(selection: SelectionItem[], node: SceneTreeNode): boolean {
  return selection.some((s) => s.kind === node.kind && s.id === node.id)
}

export function SceneTreeRow({ node, level }: SceneTreeRowProps) {
  const [expanded, setExpanded] = useState(true)
  const selected = useSessionStore((s) => isSelected(s.selection, node))
  const select = useSessionStore((s) => s.select)
  const hasChildren = node.kind === "group" && node.children.length > 0
  const item: SelectionItem =
    node.kind === "group" ? { kind: "group", id: node.id } : { kind: "part", id: node.id }

  const onClick = (event: React.MouseEvent) => {
    const current = useSessionStore.getState().selection
    if (event.ctrlKey) {
      select(selected ? current.filter((s) => s.id !== node.id) : [...current, item])
    } else {
      select([item])
    }
  }

  const Chevron = expanded ? ChevronDown : ChevronRight
  const Icon = node.kind === "group" ? Folder : Box

  return (
    <li
      role="treeitem"
      aria-selected={selected}
      aria-level={level}
      aria-expanded={hasChildren ? expanded : undefined}
    >
      <div
        className={cn(
          "flex h-7 cursor-default items-center gap-1 rounded-sm pr-2 text-sm",
          selected ? "bg-accent text-accent-foreground" : "hover:bg-accent-subtle"
        )}
        style={{ paddingLeft: `${(level - 1) * 14 + 4}px` }}
        onClick={onClick}
      >
        <button
          type="button"
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          className={cn("grid size-4 place-items-center", !hasChildren && "invisible")}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          <Chevron className="size-3.5" />
        </button>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{node.name}</span>
      </div>
      {hasChildren && expanded && (
        <ul role="group">
          {node.children.map((child) => (
            <SceneTreeRow key={child.id} node={child} level={level + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
