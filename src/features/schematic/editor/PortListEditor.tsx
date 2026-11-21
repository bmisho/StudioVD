import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { localKey } from "@/core/library/userComponent/keys"
import type { Domain, Payload, Port } from "@/core/schema"
import { CONSERVED_DOMAINS, DomainSchema, PayloadSchema } from "@/core/schema/schematic"
import { DOMAIN_STYLE } from "../domainStyle"
import { OptionSelect } from "./OptionSelect"

const DOMAINS = DomainSchema.options
const PAYLOADS = PayloadSchema.options
const DIRECTIONS = ["in", "out"] as const
const COLUMNS = "grid grid-cols-[1fr_5.5rem_8rem_4.75rem_6.5rem_3.5rem_1.75rem] items-center gap-1"

/** A port moved to another domain: terminals for conserved ones, a payload only for data. */
function withDomain(p: Port, domain: Domain): Port {
  const { key, name, unit, side } = p
  const conserved = CONSERVED_DOMAINS.has(domain)
  const direction = conserved ? "terminal" : p.direction === "terminal" ? "in" : p.direction
  return {
    key,
    name,
    unit,
    domain,
    direction,
    ...(side ? { side } : {}),
    ...(domain === "data" ? { payload: "number" as const } : {}),
  }
}

/** A black box's ports (PLAN 11.5): name, the key its program uses, domain, direction, unit. */
export function PortListEditor({
  ports,
  onChange,
}: {
  ports: Port[]
  onChange: (ports: Port[]) => void
}) {
  const edit = (i: number, port: Port) => onChange(ports.map((p, j) => (j === i ? port : p)))
  const add = () => {
    const key = localKey("in", new Set(ports.map((p) => p.key)), "p")
    onChange([
      ...ports,
      { key, name: key, domain: "data", direction: "in", unit: "", payload: "number" },
    ])
  }
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">Ports</legend>
      {ports.length > 0 && (
        <div className={`${COLUMNS} text-xs text-muted-foreground`} aria-hidden>
          <span>Name</span>
          <span>Key</span>
          <span>Domain</span>
          <span>Direction</span>
          <span>Carries</span>
          <span>Unit</span>
          <span />
        </div>
      )}
      {ports.map((p, i) => (
        <div key={i} role="group" aria-label={`Port ${i + 1}`} className={COLUMNS}>
          <Input
            aria-label="Port name"
            value={p.name}
            maxLength={120}
            onChange={(e) => edit(i, { ...p, name: e.target.value })}
            className="h-7 text-xs"
          />
          <Input
            aria-label="Port key"
            value={p.key}
            maxLength={32}
            spellCheck={false}
            onChange={(e) => edit(i, { ...p, key: e.target.value })}
            className="h-7 font-mono text-xs"
          />
          <OptionSelect<Domain>
            label="Domain"
            value={p.domain}
            options={DOMAINS}
            text={(d) => DOMAIN_STYLE[d].name}
            onChange={(d) => edit(i, withDomain(p, d))}
          />
          {p.direction === "terminal" ? (
            <span className="px-2 text-xs text-muted-foreground">Terminal</span>
          ) : (
            <OptionSelect<(typeof DIRECTIONS)[number]>
              label="Direction"
              value={p.direction}
              options={DIRECTIONS}
              text={(d) => (d === "in" ? "In" : "Out")}
              onChange={(direction) => edit(i, { ...p, direction })}
            />
          )}
          {p.domain === "data" ? (
            <OptionSelect<Payload>
              label="Carries"
              value={p.payload ?? "number"}
              options={PAYLOADS}
              onChange={(payload) => edit(i, { ...p, payload })}
            />
          ) : (
            <span />
          )}
          <Input
            aria-label="Port unit"
            value={p.unit}
            maxLength={16}
            onChange={(e) => edit(i, { ...p, unit: e.target.value })}
            className="h-7 text-xs"
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={`Remove port ${p.name}`}
            onClick={() => onChange(ports.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" className="h-7 self-start text-xs" onClick={add}>
        Add port
      </Button>
    </fieldset>
  )
}
