import type { Command } from "./types"

/** One row of Help › Keyboard Shortcuts. */
export interface ShortcutRow {
  label: string
  keys: readonly string[]
}

export interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

/** Command id prefixes, in the order the dialog lists them. */
const GROUPS: readonly [string, string][] = [
  ["file", "File"],
  ["edit", "Edit"],
  ["transform", "Edit"],
  ["part", "Parts"],
  ["view", "View"],
  ["tool", "Tools"],
  ["test", "Test mode"],
  ["help", "Help"],
]

/**
 * Every command that has a key, grouped as the menus are (PLAN 15.4). Built from the registry,
 * so the list can never disagree with what the keys do.
 */
export function shortcutGroups(commands: readonly Command[]): ShortcutGroup[] {
  const groups = new Map<string, ShortcutGroup>()
  for (const c of commands) {
    if (!c.shortcuts || c.shortcuts.length === 0) continue
    const prefix = c.id.split(".")[0] ?? ""
    const title = GROUPS.find(([p]) => p === prefix)?.[1] ?? "Other"
    const group = groups.get(title) ?? { title, rows: [] }
    group.rows.push({ label: c.label, keys: c.shortcuts })
    groups.set(title, group)
  }
  const order = [...new Set(GROUPS.map(([, t]) => t)), "Other"]
  return [...groups.values()].sort((a, b) => order.indexOf(a.title) - order.indexOf(b.title))
}
