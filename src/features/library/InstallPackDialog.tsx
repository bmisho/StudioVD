import { TriangleAlert } from "lucide-react"
import { restoreDialogFocus } from "@/app/dialogs/focusReturn"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PackComponentCheck } from "@/core/library/packCheck"
import { cn } from "@/lib/utils"
import { useLibraryStore } from "@/store/session/libraryStore"
import { libraryController } from "./libraryService"

const STATUS = {
  ok: { label: "OK", className: "text-success" },
  newer: { label: "Needs newer StudioVD", className: "text-muted-foreground" },
  invalid: { label: "Invalid", className: "text-destructive" },
} as const

const size = (bytes: number) =>
  bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1000))} kB` : `${(bytes / 1e6).toFixed(1)} MB`

function CheckRow({ check }: { check: PackComponentCheck }) {
  return (
    <li className="flex flex-col gap-0.5 px-2 py-1.5 odd:bg-surface">
      <div className="flex justify-between gap-3">
        <span className="truncate font-medium">{check.name}</span>
        <span className={cn("shrink-0", STATUS[check.status].className)}>
          {STATUS[check.status].label}
        </span>
      </div>
      <span className="truncate text-muted-foreground">
        {check.id} {check.version} · {check.licence}
      </span>
      {check.message && <span className="text-destructive">{check.message}</span>}
    </li>
  )
}

/** Install from file (PLAN 9.2): what the pack holds, each manifest's check, then confirm. */
export function InstallPackDialog() {
  const install = useLibraryStore((s) => s.install)
  const open = install.phase !== "idle"
  const busy = install.phase === "installing"
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !busy && void libraryController.cancelInstall()}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!busy}
        onCloseAutoFocus={restoreDialogFocus}
      >
        <DialogHeader>
          <DialogTitle>Install components</DialogTitle>
          <DialogDescription>
            {open
              ? `${install.checks.length === 1 ? "1 component" : `${install.checks.length} components`}, ${install.files} files, ${size(install.bytes)}.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {open && !install.verified && (
          <p className="flex gap-2 rounded-md border border-warning p-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Unverified: no catalogue StudioVD trusts has signed this pack. Install it only if you
            trust where it came from. Its components will be marked Unverified.
          </p>
        )}
        <ul
          aria-label="Components in the pack"
          className="max-h-56 overflow-auto rounded-md border text-xs"
        >
          {open && install.checks.map((c) => <CheckRow key={`${c.id}@${c.version}`} check={c} />)}
        </ul>
        {open && !install.installable && (
          <p className="text-xs text-destructive">
            This pack cannot be installed: a component in it is invalid.
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void libraryController.cancelInstall()}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!open || !install.installable || busy}
            onClick={() => void libraryController.confirmInstall()}
          >
            {busy ? "Installing…" : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
