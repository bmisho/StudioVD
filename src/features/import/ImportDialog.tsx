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
import { formatOf } from "@/core/import/importOptions"
import type { PickedFile } from "@/lib/tauri/files"
import { useImportStore, type ImportProgress } from "@/store/session/importStore"
import { ImportOptionsFields } from "./ImportOptionsFields"
import { importController } from "./importService"

const megabytes = (bytes: number) =>
  bytes < 100_000 ? `${Math.max(1, Math.round(bytes / 1000))} kB` : `${(bytes / 1e6).toFixed(1)} MB`

function FileList({ files }: { files: readonly PickedFile[] }) {
  return (
    <ul
      className="max-h-32 overflow-auto rounded-md border border-border text-xs"
      aria-label="Files"
    >
      {files.map((f) => (
        <li key={f.token} className="flex justify-between gap-3 px-2 py-1 odd:bg-surface">
          <span className="truncate" title={f.name}>
            {f.name}
          </span>
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {formatOf(f.name) === null ? "not supported" : megabytes(f.size)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ProgressView({ progress, count }: { progress: ImportProgress; count: number }) {
  const overall = (progress.fileIndex + progress.fraction) / Math.max(count, 1)
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <p className="truncate text-xs">
        <span className="tabular-nums">
          File {progress.fileIndex + 1} of {count}
        </span>
        : {progress.fileName}. {progress.stage}…
      </p>
      <div
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(overall * 100)}
        className="h-2 overflow-hidden rounded-full bg-accent"
      >
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${overall * 100}%` }}
        />
      </div>
    </div>
  )
}

/** Options, then progress, for files picked in File › Import or dropped on the window. */
export function ImportDialog() {
  const status = useImportStore((s) => s.status)
  const close = useImportStore((s) => s.close)
  const running = status.phase === "running"
  const files = status.phase === "idle" ? [] : status.files
  const importable = files.filter((f) => formatOf(f.name) !== null).length

  return (
    <Dialog
      open={status.phase !== "idle"}
      // While running, only the Cancel button stops the import (Escape would be too easy).
      onOpenChange={(open) => !open && !running && close()}
    >
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!running}
        onCloseAutoFocus={restoreDialogFocus}
      >
        <DialogHeader>
          <DialogTitle>Import</DialogTitle>
          <DialogDescription>
            {files.length === 1 ? "1 file" : `${files.length} files`}. Parts keep their position
            from the file; the first part of a new scene is grounded.
          </DialogDescription>
        </DialogHeader>
        <FileList files={files} />
        {status.phase === "running" ? (
          <ProgressView progress={status.progress} count={files.length} />
        ) : (
          <ImportOptionsFields files={files} />
        )}
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (running ? importController.cancel() : close())}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={running || importable === 0}
            onClick={() => void importController.run()}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
