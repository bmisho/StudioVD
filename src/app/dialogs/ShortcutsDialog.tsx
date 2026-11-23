import { useMemo } from "react"
import { useCommands } from "@/app/commands/commandsContext"
import { shortcutGroups } from "@/app/commands/shortcutList"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { NAVIGATION_PRESETS } from "@/core/navigation/mousePresets"
import { usePreferencesStore } from "@/store/preferences/preferencesStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { restoreDialogFocus } from "./focusReturn"

/** Help › Keyboard Shortcuts (PLAN 15.4): every key the command registry answers. */
export function ShortcutsDialog() {
  const open = useSessionStore((s) => s.dialog === "shortcuts")
  const closeDialog = useSessionStore((s) => s.closeDialog)
  const registry = useCommands()
  const groups = useMemo(() => shortcutGroups(registry.list), [registry])
  const preset = usePreferencesStore((s) => NAVIGATION_PRESETS[s.navigationPreset].label)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={restoreDialogFocus}>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Mouse navigation follows the {preset} preset (View › Mouse Navigation).
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-2 gap-x-6 gap-y-3 overflow-y-auto text-xs">
          {groups.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h3 className="mb-1 font-semibold">{g.title}</h3>
              <dl className="flex flex-col gap-0.5">
                {g.rows.map((r) => (
                  <div key={r.label} className="flex justify-between gap-3">
                    <dt className="truncate">{r.label}</dt>
                    <dd className="shrink-0 text-muted-foreground tabular-nums">
                      {r.keys.map((k) => (
                        <kbd key={k} className="ml-1 rounded border bg-surface px-1 font-sans">
                          {k}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
