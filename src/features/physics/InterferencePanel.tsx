import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { useTestRunStore } from "@/store/session/testRunStore"

/** Rows shown at most; the rest are counted. */
const SHOWN = 6
const mm = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

/**
 * Parts that overlap where the test run started (PLAN 10.3), over the 3D view: their contacts
 * are off for this run so the assembly does not fly apart. A row selects both parts.
 */
export function InterferencePanel() {
  const testMode = useSessionStore((s) => s.testMode)
  const rows = useTestRunStore((s) => s.interferences)
  const dismissed = useTestRunStore((s) => s.dismissed)
  const parts = useDocumentStore((s) => s.doc.parts)
  if (!testMode || dismissed || rows.length === 0) return null
  const name = (id: string) =>
    Object.hasOwn(parts, id) ? parts[id as keyof typeof parts]?.name : id
  return (
    <section
      aria-label="Interference"
      className="absolute top-2 left-2 flex max-w-72 flex-col gap-1 rounded-md border border-warning bg-background p-2 text-xs shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-warning">
          {rows.length === 1 ? "2 parts overlap" : `${rows.length} pairs of parts overlap`}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          aria-label="Close the interference list"
          onClick={() => useTestRunStore.getState().dismiss()}
        >
          <X className="size-3" aria-hidden />
        </Button>
      </div>
      <p className="text-muted-foreground">They ignore each other in this run.</p>
      <ul className="flex flex-col">
        {rows.slice(0, SHOWN).map((r) => (
          <li key={`${r.a}:${r.b}`}>
            <button
              type="button"
              className="w-full truncate rounded px-1 py-0.5 text-left hover:bg-accent-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() =>
                useSessionStore.getState().select([
                  { kind: "part", id: r.a },
                  { kind: "part", id: r.b },
                ])
              }
            >
              {name(r.a)} ↔ {name(r.b)}{" "}
              <span className="text-muted-foreground tabular-nums">{mm.format(r.depthMm)} mm</span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > SHOWN && (
        <p className="text-muted-foreground">and {rows.length - SHOWN} more</p>
      )}
    </section>
  )
}
