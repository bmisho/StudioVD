import { useEffect } from "react"
import type { CommandRegistry } from "@/app/commands/registry"
import type { Command } from "@/app/commands/types"
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
 */
export function useGlobalShortcuts(registry: CommandRegistry): void {
  useEffect(() => {
    const shortcuts = buildShortcutMap(registry)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const combo = comboFromEvent(event)
      if (!combo) return
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
      registry.run(command.id)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [registry])
}
