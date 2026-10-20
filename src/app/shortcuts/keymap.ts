// Keyboard combos are canonical strings: modifiers in the order Ctrl, Alt, Shift, then the key
// ("Ctrl+Shift+Z", "Delete", "F"). Letters are upper-case; Space is "Space".

export interface KeyLike {
  key: string
  /** Physical key (KeyboardEvent.code), used when `key` is a non-Latin character. */
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "OS"])
const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift"] as const

/** Named keys as KeyboardEvent.key spells them, looked up case-insensitively. */
const NAMED_KEYS = new Map(
  [
    "Space",
    "Delete",
    "Backspace",
    "Escape",
    "Enter",
    "Tab",
    "Insert",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ].map((k) => [k.toLowerCase(), k])
)

function normalizeKey(key: string): string {
  if (key === " ") return "Space"
  if (key.length === 1) return key.toUpperCase()
  return NAMED_KEYS.get(key.toLowerCase()) ?? key
}

const PHYSICAL_KEY = /^(?:Key([A-Z])|Digit([0-9]))$/

/**
 * The key a combo is bound to. Latin layouts (QWERTY, AZERTY, QWERTZ…) use the character, so
 * AZERTY's Ctrl+Z is the key labelled Z. Non-Latin layouts (Cyrillic, Greek, Hebrew…) report
 * characters like "я" for Ctrl+Z, so with Ctrl/Alt held we fall back to the physical key, as
 * native Windows/Linux accelerators do.
 */
function bindingKey(event: KeyLike): string {
  const key = normalizeKey(event.key)
  const nonLatin = key.length === 1 && !/^[\x20-\x7e]$/.test(key)
  if (nonLatin && (event.ctrlKey || event.altKey)) {
    const match = PHYSICAL_KEY.exec(event.code)
    const physical = match?.[1] ?? match?.[2]
    if (physical) return physical
  }
  return key
}

/**
 * Converts a keyboard event into a canonical combo, or null for bare modifier presses and
 * Meta (Super/Windows key) combos, which belong to the OS on Windows and Linux.
 */
export function comboFromEvent(event: KeyLike): string | null {
  if (MODIFIER_KEYS.has(event.key) || event.metaKey) return null
  const parts: string[] = []
  if (event.ctrlKey) parts.push("Ctrl")
  if (event.altKey) parts.push("Alt")
  if (event.shiftKey) parts.push("Shift")
  parts.push(bindingKey(event))
  return parts.join("+")
}

/**
 * Puts a hand-written combo ("shift+ctrl+z") into canonical form ("Ctrl+Shift+Z").
 * Throws on unknown modifiers or key names, so a typo in a command definition fails at
 * startup (and in tests) instead of silently never matching.
 */
export function normalizeCombo(combo: string): string {
  const tokens = combo.split("+").map((t) => t.trim())
  const key = tokens.pop() ?? ""
  const mods = new Set(tokens.map((t) => t.toLowerCase()))
  for (const mod of mods) {
    if (!MODIFIER_ORDER.some((m) => m.toLowerCase() === mod)) {
      throw new Error(`Unknown modifier "${mod}" in shortcut "${combo}"`)
    }
  }
  const normalized = normalizeKey(key)
  if (normalized.length !== 1 && !NAMED_KEYS.has(normalized.toLowerCase())) {
    throw new Error(`Unknown key "${key}" in shortcut "${combo}"`)
  }
  const ordered = MODIFIER_ORDER.filter((m) => mods.has(m.toLowerCase()))
  return [...ordered, normalized].join("+")
}

/**
 * True when the event target is a place where the user types text, or picks from a list by
 * typing (a select, a combobox: letters jump to an item, so they are not shortcuts there).
 */
export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.closest('[role="combobox"]')) return true
  if (tag !== "INPUT") return false
  const type = (target as HTMLInputElement).type
  return !["button", "checkbox", "radio", "range", "submit", "reset", "color"].includes(type)
}

/**
 * Open menus, dialogs and list popups own their keys (Escape closes them, arrows navigate).
 * The menu bar itself is NOT an overlay: after a mouse menu action Radix returns focus to the
 * trigger, and Delete / Ctrl+Z must keep working from there.
 */
const OVERLAY_SELECTOR = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]'

/** True when the event target sits inside an open menu, dialog or listbox. */
export function isOverlayTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(OVERLAY_SELECTOR) !== null
}

/** True when the event target is a menu-bar trigger (focus left there after a menu closes). */
export function isMenubarTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="menubar"]') !== null
}
