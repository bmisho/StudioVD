import { Button } from "@/components/ui/button"
import { endsFit } from "@/core/connectors/defaults"
import type { AnchorId, ConnectorKind } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"

const KINDS: { kind: ConnectorKind; label: string; hint: string }[] = [
  { kind: "belt", label: "Belt", hint: "Round pulleys: each anchor on a belt line" },
  { kind: "tube", label: "Tube", hint: "Between two fittings" },
  { kind: "spring", label: "Spring", hint: "Between two anchors" },
]

/** With anchors selected: draw a belt, tube or spring between them (PLAN 9.6). */
export function ConnectAnchors({ anchors }: { anchors: readonly AnchorId[] }) {
  const add = (kind: ConnectorKind) => {
    const id = useDocumentStore.getState().addConnector(kind, anchors)
    if (id) useSessionStore.getState().select([{ kind: "connector", id }])
  }
  return (
    <section className="flex flex-col gap-1.5" aria-label="Connect anchors">
      <h3 className="text-xs font-semibold">Connect {anchors.length} anchors</h3>
      <div className="flex gap-1">
        {KINDS.map((k) => (
          <Button
            key={k.kind}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            title={k.hint}
            disabled={!endsFit(k.kind, anchors.length)}
            onClick={() => add(k.kind)}
          >
            {k.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Visual only: it follows the anchors as they move.
      </p>
    </section>
  )
}
