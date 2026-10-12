import { useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { restoreDialogFocus } from "@/app/dialogs/focusReturn"
import { useProjectStore } from "@/store/session/projectStore"

/** Save / Don't Save / Cancel before New, Open, Close or quitting replaces unsaved work. */
export function UnsavedChangesDialog() {
  const prompt = useProjectStore((s) => s.prompt)
  const fileName = useProjectStore((s) => s.fileName)
  const saveRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={prompt !== null} onOpenChange={(open) => !open && prompt?.answer("cancel")}>
      <DialogContent
        role="alertdialog"
        className="sm:max-w-sm"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          saveRef.current?.focus()
        }}
        onCloseAutoFocus={restoreDialogFocus}
      >
        <DialogHeader>
          <DialogTitle>Save changes to {fileName ?? "Untitled"}?</DialogTitle>
          <DialogDescription>
            There are unsaved changes. Save them before {prompt?.action ?? "continuing"}?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => prompt?.answer("discard")}>
            Don&apos;t Save
          </Button>
          <Button variant="outline" size="sm" onClick={() => prompt?.answer("cancel")}>
            Cancel
          </Button>
          <Button ref={saveRef} size="sm" onClick={() => prompt?.answer("save")}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
