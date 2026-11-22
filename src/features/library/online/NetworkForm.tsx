import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { NetworkSettings, NetworkView } from "@/lib/tauri/network"
import { networkController } from "./catalogService"
import { ConnectionTest } from "./ConnectionTest"
import { ProxyFields } from "./ProxyFields"

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/** Settings › Network's fields: switches and lists save at once, text fields on Enter or blur. */
export function NetworkForm({ view }: { view: NetworkView }) {
  const s = view.settings
  const [mirror, setMirror] = useState(s.mirror ?? "")
  const save = (patch: Partial<NetworkSettings>) => void networkController.save({ ...s, ...patch })
  const commitMirror = () => {
    const next = mirror.trim() || null
    if (next !== s.mirror) save({ mirror: next })
  }
  return (
    <div className="flex flex-col gap-3 text-xs">
      <Toggle
        id="net-offline"
        label="Offline mode (no network use at all)"
        checked={s.offline}
        onChange={(offline) => save({ offline })}
      />
      <Toggle
        id="net-weekly"
        label="Look for catalog updates once a week, on start"
        checked={s.weeklyCheck}
        onChange={(weeklyCheck) => save({ weeklyCheck })}
      />
      <ProxyFields view={view} onChange={(proxy) => save({ proxy })} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="net-mirror" className="text-xs">
          Mirror (an https:// address holding the same files)
        </Label>
        <Input
          id="net-mirror"
          className="h-7 text-xs"
          placeholder="A server address starting with https"
          value={mirror}
          onChange={(e) => setMirror(e.target.value)}
          onBlur={commitMirror}
          onKeyDown={(e) => e.key === "Enter" && commitMirror()}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span>
          Extra trusted certificate:{" "}
          <span className="text-muted-foreground">
            {s.extraCa ?? "none (the system's are used)"}
          </span>
        </span>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void networkController.pickCa()}
          >
            Choose…
          </Button>
          {s.extraCa && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void networkController.clearCa()}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="text-muted-foreground">
        Network use: {s.consented ? "allowed" : "not allowed yet (asked on first use)"}.
        {view.hosts.length > 0 && ` Hosts: ${view.hosts.join(", ")}.`}
      </p>
      <ConnectionTest />
    </div>
  )
}
