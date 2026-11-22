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
import { networkController } from "./catalogService"
import { NetworkForm } from "./NetworkForm"

/** Settings › Network (PLAN 4.7, 14.4). Each change is saved (and checked) by Rust at once. */
export function NetworkSettingsDialog() {
  const open = useCatalogStore((s) => s.networkOpen)
  const view = useCatalogStore((s) => s.network)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && networkController.close()}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={restoreDialogFocus}>
        <DialogHeader>
          <DialogTitle>Network settings</DialogTitle>
          <DialogDescription>
            StudioVD goes online only to download the catalog and packs you ask for.
          </DialogDescription>
        </DialogHeader>
        {view && <NetworkForm view={view} />}
        <DialogFooter>
          <Button size="sm" onClick={() => networkController.close()}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
