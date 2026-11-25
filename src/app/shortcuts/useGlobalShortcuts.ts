import { useEffect } from "react"
import type { CommandRegistry } from "@/app/commands/registry"
import type { Command } from "@/app/commands/types"
import { BROWSER_ONLY_KEYS } from "./browserGuards"
import {
  comboFromEvent,
  isMenubarTarget,
  isOverlayTarget,
  isTextInputTarget,
  normalizeCombo,
} from "./keymap"

export function buildShortcutMap(registry: CommandRegistry): Map<string, Command> {
  const map = new Map<string, Command>()
  for (const command of registry.list) {
    for (const combo of command.shortcuts ?? []) {
      const key = normalizeCombo(combo)
      if (map.has(key)) throw new Error(`Shortcut ${key} is bound twice`)
      if (BROWSER_ONLY_KEYS.has(key)) throw new Error(`Shortcut ${key} is the webview's`)
      map.set(key, command)
    }
  }
  return map
}

/**
 * Global keyboard shortcuts.
 * - In text fields and open menus/dialogs only commands marked `allowInTextInput` fire, so
 *   Ctrl+Z / Delete / Escape keep their local meaning (text editing, closing the overlay).
 * - Escape on a menu-bar trigger only leaves the menu bar (as on Windows); it must not also
 *   clear the selection. Every other shortcut works from the menu bar.
 * - Auto-repeat only re-runs commands marked `repeatable`.
 * - The webview's own keys (reload, history, print) are swallowed everywhere.
 */
export function useGlobalShortcuts(registry: CommandRegistry): void {
  useEffect(() => {
    const shortcuts = buildShortcutMap(registry)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const combo = comboFromEvent(event)
      if (!combo) return
      // Reload, Back, Print: the webview's, never the app's (they lose or leave the work).
      if (BROWSER_ONLY_KEYS.has(combo)) return event.preventDefault()
      if (combo === "Escape" && isMenubarTarget(event.target)) {
        event.preventDefault()
        if (event.target instanceof HTMLElement) event.target.blur()
        return
      }
      const command = shortcuts.get(combo)
      if (!command) return
      const local = isTextInputTarget(event.target) || isOverlayTarget(event.target)
      if (local && !command.allowInTextInput) return
      // Swallow the browser default (Ctrl+S "save page", Ctrl+O, …) even when disabled.
      event.preventDefault()
      // A held key auto-repeats: fine for undo/redo, not for "new group" or "save".
      if (event.repeat && !command.repeatable) return
      registry.run(command.id)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [registry])
}
