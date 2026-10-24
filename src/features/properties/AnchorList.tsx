import { useId } from "react"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { anchorsOf } from "@/core/assembly/anchorIndex"
import { anchorLabel, kindLabel } from "@/core/assembly/anchorNames"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { FOCUSABLE_HEADING, anchorListId, focusAnchorInspector } from "./inspectorFocus"

/**
 * A part's anchors (PLAN 7.4): one button each, which selects it (the inspector then edits
 * it, and takes focus); and Place Anchor, to add more.
 */
export function AnchorList({ partId }: { partId: PartId }) {
  const hintId = useId()
  const anchors = useDocumentStore(useShallow((s) => anchorsOf(s.doc.anchors, partId)))
  const select = useSessionStore((s) => s.select)
  const setTool = useSessionStore((s) => s.setTool)
  const testMode = useSessionStore((s) => s.testMode)
  const hint = testMode
    ? "Leave test mode to place anchors"
    : "Click a face, edge, corner or hole of a part"
  return (
    <section aria-labelledby={anchorListId(partId)} className="flex flex-col gap-1">
      <h4
        id={anchorListId(partId)}
        tabIndex={-1}
        className={`text-xs font-semibold ${FOCUSABLE_HEADING}`}
      >
        Anchors
      </h4>
      {anchors.length === 0 ? (
        <p className="text-xs text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col">
          {anchors.map((a) => (
            <li key={a.id}>
              <Button
                variant="ghost"
                size="sm"
                className="group h-7 w-full justify-between gap-2 px-2 text-xs"
                onClick={() => {
                  select([{ kind: "anchor", id: a.id }])
                  focusAnchorInspector(a.id)
                }}
              >
                <span className="truncate">{anchorLabel(a)}</span>
                {/* An unnamed anchor is already called by its kind. On hover the row is
                    accent, where muted text falls below 4.5:1 (§7). */}
                {a.name !== undefined && (
                  <span className="text-muted-foreground group-hover:text-accent-foreground">
                    {kindLabel(a.kind)}
                  </span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 self-start text-xs aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
        aria-disabled={testMode || undefined}
        aria-describedby={hintId}
        title={hint}
        onClick={() => {
          if (!testMode) setTool("anchor")
        }}
      >
        Place Anchor
      </Button>
      {/* The tooltip is mouse-only; screen readers get the same hint here. */}
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </section>
  )
}
