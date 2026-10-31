import { restoreDialogFocus } from "@/app/dialogs/focusReturn"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLibraryStore, type SaveSummary } from "@/store/session/libraryStore"
import { userComponents } from "./libraryService"
import { SaveComponentForm } from "./SaveComponentForm"

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What goes in, what stays out, and the licences it inherits. */
function Contents({ summary: s }: { summary: SaveSummary }) {
  const left = [
    s.externalMates > 0 && `${count(s.externalMates, "mate")} to other parts`,
    s.suppressedMates > 0 && `${count(s.suppressedMates, "suppressed mate")}`,
    s.connectors > 0 && `${count(s.connectors, "belt, tube or spring", "belts, tubes or springs")}`,
  ].filter(Boolean)
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-surface p-2 text-xs">
      <p>
        {count(s.parts, "part")}, {count(s.anchors, "anchor")} and {count(s.mates, "mate")} between
        them, with their materials.
      </p>
      {left.length > 0 && <p className="text-muted-foreground">Not saved: {left.join(", ")}.</p>}
      {s.inherited.length > 0 && (
        <p className="text-muted-foreground">
          Keeps the licences of {s.inherited.join(", ")}: they travel with it and cannot be removed.
        </p>
      )}
    </div>
  )
}

/** Edit › Save as Component… (PLAN 9.7): the selection into My components. */
export function SaveComponentDialog() {
  const save = useLibraryStore((s) => s.save)
  const open = save.phase !== "idle"
  const busy = save.phase === "saving"
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && userComponents.cancel()}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!busy}
        onCloseAutoFocus={restoreDialogFocus}
      >
        <DialogHeader>
          <DialogTitle>Save as component</DialogTitle>
          <DialogDescription>
            Saved to My components in your library, ready to insert into any project.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <>
            <Contents summary={save.summary} />
            <SaveComponentForm
              defaults={save.defaults}
              namespace={save.namespace}
              busy={busy}
              error={save.error}
              taken={userComponents.takenVersions}
              onSave={(form) => void userComponents.save(form)}
              onCancel={userComponents.cancel}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
