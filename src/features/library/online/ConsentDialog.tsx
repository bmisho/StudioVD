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
import { useCatalogStore } from "@/store/session/catalogStore"
import { catalogController } from "./catalogService"

const NO_HOSTS: string[] = []

/**
 * First network use (PLAN 4.7): names the hosts before anything goes out. Asked once; the
 * answer is kept in Settings › Network, where Offline mode stops network use again.
 */
export function ConsentDialog() {
  const pending = useCatalogStore((s) => s.consent)
  const hosts = useCatalogStore((s) => s.status?.hosts ?? s.network?.hosts ?? NO_HOSTS)
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => !open && void catalogController.answerConsent(false)}
    >
      <DialogContent
        role="alertdialog"
        className="sm:max-w-md"
        onCloseAutoFocus={restoreDialogFocus}
      >
        <DialogHeader>
          <DialogTitle>Use the network?</DialogTitle>
          <DialogDescription>
            StudioVD downloads the component catalog and the packs you choose. It connects only when
            you ask it to (Refresh, Download, Test connection).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1 text-xs">
          <p>It will connect to:</p>
          <ul aria-label="Hosts" className="rounded-md border bg-surface px-2 py-1 font-mono">
            {hosts.length === 0 && <li>Your mirror (none is set)</li>}
            {hosts.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            and to mirrors the signed catalog lists. Every file is checked against signatures built
            into StudioVD, so a host can fail a download but not change what is installed. Nothing
            about your projects is sent. Offline mode in Settings › Network turns network use off.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void catalogController.answerConsent(false)}
          >
            Not now
          </Button>
          <Button size="sm" onClick={() => void catalogController.answerConsent(true)}>
            Allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
