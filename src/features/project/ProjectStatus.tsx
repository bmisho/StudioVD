import { useProjectStore } from "@/store/session/projectStore"

const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" })
const BUSY = { saving: "Saving…", opening: "Opening…", creating: "New project…", closing: null }

/** Status bar: what the project's file holds compared with the document. */
export function ProjectStatus() {
  const busy = useProjectStore((s) => s.busy)
  const dirty = useProjectStore((s) => s.dirty)
  const savedAt = useProjectStore((s) => s.savedAt)
  const autosavedAt = useProjectStore((s) => s.autosavedAt)
  // While the unsaved-changes prompt waits for an answer, nothing is in progress yet.
  const asking = useProjectStore((s) => s.prompt !== null)
  const busyText = busy && !asking ? BUSY[busy] : null
  let text = "No changes"
  if (busyText) text = busyText
  else if (dirty)
    text = autosavedAt
      ? `Unsaved changes (autosaved ${time.format(autosavedAt)})`
      : "Unsaved changes"
  else if (savedAt) text = `Saved ${time.format(savedAt)}`
  return (
    <span className="tabular-nums" role="status">
      <span className="text-muted-foreground">Project </span>
      {text}
    </span>
  )
}
