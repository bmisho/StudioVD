import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cableStatus, type Cable } from "@/core/connectors/cableMesh"
import { connectorFrames } from "@/core/connectors/frames"
import { NumberField } from "@/features/materials/controls/NumberField"
import type { ConnectorPatch } from "@/store/document/connectorActions"
import { useDocumentStore } from "@/store/document/documentStore"

const SLACK = [
  { value: "arc", label: "Arcs" },
  { value: "wave", label: "Waves" },
  { value: "coil", label: "Coil" },
] as const

/** A label and its control on one row, the inspector's layout. */
function Row({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_7rem] items-center gap-2 text-xs">
      <Label htmlFor={id} className="font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

/**
 * A cable's own fields (PLAN 16.3): the length it is cut to, with its route and what that
 * leaves spare or lacks, its diameter, one wire or a twisted pair, and how spare length lies.
 */
export function CableFields({ cable: c }: { cable: Cable }) {
  const update = (patch: ConnectorPatch) => useDocumentStore.getState().updateConnector(c.id, patch)
  // As text, so the inspector re-renders only when what it shows changes.
  const status = useDocumentStore((s) => {
    const frames = connectorFrames(s.doc, c)
    const st = frames && cableStatus(c, frames)
    return st ? [st.routeMm, st.spareMm, st.shortMm].map((v) => v.toFixed(1)).join("|") : ""
  })
  const [route, spare, short] = status.split("|")
  const number = (
    key: keyof ConnectorPatch,
    label: string,
    value: number,
    min: number,
    max: number
  ) => (
    <Row key={key} id={`cable-${c.id}-${key}`} label={label}>
      <NumberField
        id={`cable-${c.id}-${key}`}
        value={Number(value.toFixed(3))}
        clamp={(v) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null)}
        onChange={(v) => update({ [key]: v })}
      />
    </Row>
  )
  const shortBy = Number(short ?? 0)
  return (
    <>
      {number("lengthMm", "Length (mm)", c.lengthMm, 1, 1e6)}
      {status && (
        <p
          className={shortBy > 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
          role={shortBy > 0 ? "alert" : undefined}
        >
          {shortBy > 0
            ? `Too short by ${short} mm: its route is ${route} mm. Drawn taut.`
            : `Route ${route} mm, ${spare} mm spare.`}
        </p>
      )}
      {route && (
        <div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            title="Set the length to the route plus 10%"
            onClick={() => update({ lengthMm: Math.ceil(Number(route) * 1.1) })}
          >
            Fit to route + 10%
          </Button>
        </div>
      )}
      {number("outerMm", "Diameter (mm)", c.outerMm, 0.1, 100)}
      {number("leadMm", "Straight out of each end (mm)", c.leadMm, 0, 1e5)}
      <Row id={`cable-${c.id}-conductors`} label="Wires">
        <Select
          value={String(c.conductors)}
          onValueChange={(v) => update({ conductors: v === "2" ? 2 : 1 })}
        >
          <SelectTrigger id={`cable-${c.id}-conductors`} size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1" className="text-xs">
              One wire
            </SelectItem>
            <SelectItem value="2" className="text-xs">
              Twisted pair
            </SelectItem>
          </SelectContent>
        </Select>
      </Row>
      {c.conductors === 2 && number("pitchMm", "One twist every (mm)", c.pitchMm, 1, 1e4)}
      <Row id={`cable-${c.id}-slack`} label="Spare length as">
        <Select
          value={c.slack}
          onValueChange={(v) => {
            const s = SLACK.find((o) => o.value === v)
            if (s) update({ slack: s.value })
          }}
        >
          <SelectTrigger id={`cable-${c.id}-slack`} size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SLACK.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <p className="text-xs text-muted-foreground">
        {c.via.length === 0
          ? "Straight from end to end; select anchors in order to route it through clips."
          : `Through ${c.via.length} waypoint${c.via.length === 1 ? "" : "s"}, in order.`}
      </p>
    </>
  )
}
