import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { APP_NAME, APP_VERSION } from "@/core/app-info"
import { getAppInfo, type AppInfo } from "@/lib/tauri/commands"
import { useSessionStore } from "@/store/session/sessionStore"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

/** Help > About. Also a live check of the IPC path: it calls the Rust `app_info` command. */
export function AboutDialog() {
  const open = useSessionStore((s) => s.dialog === "about")
  const closeDialog = useSessionStore((s) => s.closeDialog)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [backendError, setBackendError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void getAppInfo().then((result) => {
      if (cancelled) return
      if (result.ok) setInfo(result.value)
      else setBackendError(result.error.message)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{APP_NAME}</DialogTitle>
          <DialogDescription>
            3D CAD assembly visualizer and multi-domain simulator.
          </DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col gap-1">
          <Row label="Version" value={APP_VERSION} />
          {info && (
            <>
              <Row label="Tauri" value={info.tauriVersion} />
              <Row label="Platform" value={`${info.os} (${info.arch})`} />
            </>
          )}
          {backendError && <Row label="Backend" value={backendError} />}
        </dl>
      </DialogContent>
    </Dialog>
  )
}
