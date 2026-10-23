import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { anchorLabel, kindLabel } from "@/core/assembly/anchorNames"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { anchorListId } from "./anchorListFocus"

/**
 * A part's anchors (PLAN 7.4): one button each, which selects it (the inspector then edits
 * it); and Place Anchor, to add more.
 */
export function AnchorList({ partId }: { partId: PartId }) {
  const anchors = useDocumentStore(
    useShallow((s) => Object.values(s.doc.anchors).filter((a) => a.partId === partId))
  )
  const select = useSessionStore((s) => s.select)
  const setTool = useSessionStore((s) => s.setTool)
  const testMode = useSessionStore((s) => s.testMode)
  return (
    <section aria-labelledby={anchorListId(partId)} className="flex flex-col gap-1">
      <h4 id={anchorListId(partId)} tabIndex={-1} className="text-xs font-semibold outline-none">
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
                className="h-7 w-full justify-between gap-2 px-2 text-xs"
                onClick={() => select([{ kind: "anchor", id: a.id }])}
              >
                <span className="truncate">{anchorLabel(a)}</span>
                <span className="text-muted-foreground">{kindLabel(a.kind)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 self-start text-xs"
        aria-disabled={testMode}
        title={testMode ? "Not in test mode" : "Click a face, edge, corner or hole of a part"}
        onClick={() => {
          if (!testMode) setTool("anchor")
        }}
      >
        Place Anchor
      </Button>
    </section>
  )
}
