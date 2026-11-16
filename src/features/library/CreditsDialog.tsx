import { useMemo } from "react"
import { toast } from "sonner"
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
import { creditedTo, creditsText, projectCredits, type Credit } from "@/core/library/credits"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`

function CreditRow({ credit: c }: { credit: Credit }) {
  const g = c.grant
  return (
    <li className="flex flex-col gap-0.5 px-2 py-1.5 odd:bg-surface">
      <div className="flex justify-between gap-3">
        <span className="font-medium">{c.title}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {c.role} · {count(c.parts, "part")}
        </span>
      </div>
      <span>
        {g.spdx}
        {creditedTo(g) && ` · ${creditedTo(g)}`}
        {g.attributionRequired && " · attribution required"}
      </span>
      {g.copyright && <span className="text-muted-foreground">{g.copyright}</span>}
      {g.sourceUrl && (
        <span className="break-all text-muted-foreground">
          Source: {g.sourceUrl}
          {g.sourceRevision && ` @ ${g.sourceRevision}`}
        </span>
      )}
      {g.modifications && <span className="text-muted-foreground">Changes: {g.modifications}</span>}
      {g.licenseText && (
        <span className="text-muted-foreground">Licence text travels in the project file.</span>
      )}
    </li>
  )
}

/** Help › Project Credits… (PLAN 9.8): every licence this project's parts carry. */
export function CreditsDialog() {
  const open = useSessionStore((s) => s.dialog === "credits")
  const closeDialog = useSessionStore((s) => s.closeDialog)
  const doc = useDocumentStore((s) => s.doc)
  const credits = useMemo(
    () => (open ? projectCredits(doc, undefined, { data: true }) : []),
    [open, doc]
  )
  const copy = () =>
    navigator.clipboard.writeText(creditsText(credits, "this project")).then(
      () => toast.success("Credits copied"),
      () => toast.error("The credits could not be copied")
    )
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="select-text sm:max-w-lg" onCloseAutoFocus={restoreDialogFocus}>
        <DialogHeader>
          <DialogTitle>Project credits</DialogTitle>
          <DialogDescription>
            Licences of the library components and models in this project. They are saved in the
            project file and written into every export.
          </DialogDescription>
        </DialogHeader>
        {credits.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing here needs crediting: parts you imported carry no licence, and parts from the
            built-in generators are free to use (CC0).
          </p>
        ) : (
          <ul aria-label="Credits" className="max-h-80 overflow-auto rounded-md border text-xs">
            {credits.map((c) => (
              <CreditRow key={c.key} credit={c} />
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={credits.length === 0}
            onClick={() => void copy()}
          >
            Copy as text
          </Button>
          <Button size="sm" onClick={closeDialog}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
