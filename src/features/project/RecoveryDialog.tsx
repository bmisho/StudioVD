import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { RecoveryCandidate } from "@/lib/tauri/project"
import { useProjectStore } from "@/store/session/projectStore"
import { projectController } from "./projectService"

const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

function CandidateRow({ candidate }: { candidate: RecoveryCandidate }) {
  return (
    <li className="flex items-center gap-2 px-2 py-1.5 odd:bg-surface">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={candidate.title}>
          {candidate.title}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {candidate.fileName ?? "Never saved"} · autosaved{" "}
          {when.format(new Date(candidate.autosavedAtMs))}
        </p>
      </div>
      <Button size="sm" onClick={() => void projectController.restore(candidate.token)}>
        Restore
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void projectController.discardRecovered(candidate.token)}
      >
        Discard
      </Button>
    </li>
  )
}

/** At startup: work a crashed or killed session never saved (PLAN 5.5). */
export function RecoveryDialog() {
  const candidates = useProjectStore((s) => s.recovery)
  const later = () => useProjectStore.getState().setRecovery([])
  return (
    <Dialog open={candidates.length > 0} onOpenChange={(open) => !open && later()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recover unsaved work</DialogTitle>
          <DialogDescription>
            StudioVD closed before these changes were saved. Restore one to keep working on it, or
            discard it for good.
          </DialogDescription>
        </DialogHeader>
        <ul
          className="max-h-60 overflow-auto rounded-md border border-border"
          aria-label="Unsaved work"
        >
          {candidates.map((c) => (
            <CandidateRow key={c.token} candidate={c} />
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={later}>
            Decide Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
