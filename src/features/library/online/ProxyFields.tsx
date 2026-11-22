import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { NetworkView, ProxySetting } from "@/lib/tauri/network"

const MODES: { value: ProxySetting["mode"]; label: string }[] = [
  { value: "system", label: "System proxy" },
  { value: "none", label: "No proxy" },
  { value: "manual", label: "Manual proxy" },
]

/** The proxy part of Settings › Network: mode, and for a manual proxy its address and bypass. */
export function ProxyFields({
  view,
  onChange,
}: {
  view: NetworkView
  onChange: (proxy: ProxySetting) => void
}) {
  const proxy = view.settings.proxy
  const [url, setUrl] = useState(proxy.mode === "manual" ? proxy.url : "")
  const [bypass, setBypass] = useState(proxy.mode === "manual" ? proxy.bypass : "<local>")
  const commit = () => url.trim() && onChange({ mode: "manual", url: url.trim(), bypass })
  const enter = (e: React.KeyboardEvent) => e.key === "Enter" && commit()
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-medium">Proxy</legend>
      <Select
        value={proxy.mode}
        onValueChange={(mode) => {
          if (mode === "manual") commit()
          else onChange({ mode: mode as "system" | "none" })
        }}
      >
        <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Proxy">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODES.map((m) => (
            <SelectItem key={m.value} value={m.value} className="text-xs">
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor="proxy-url" className="text-xs">
        Manual proxy (host:port or URL)
      </Label>
      <Input
        id="proxy-url"
        className="h-7 text-xs"
        placeholder="proxy.example.com:8080"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => proxy.mode === "manual" && commit()}
        onKeyDown={enter}
      />
      <Label htmlFor="proxy-bypass" className="text-xs">
        Direct for (comma separated; * wildcards, &lt;local&gt;)
      </Label>
      <Input
        id="proxy-bypass"
        className="h-7 text-xs"
        value={bypass}
        onChange={(e) => setBypass(e.target.value)}
        onBlur={() => proxy.mode === "manual" && commit()}
        onKeyDown={enter}
      />
      <p className="text-xs text-muted-foreground">In use: {view.proxyInUse}</p>
      {proxy.mode === "system" && (
        <p className="text-xs text-muted-foreground">System proxy here means {view.systemProxy}</p>
      )}
    </fieldset>
  )
}
