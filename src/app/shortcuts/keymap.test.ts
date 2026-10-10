import { describe, expect, it } from "vitest"
import {
  comboFromEvent,
  isMenubarTarget,
  isOverlayTarget,
  isTextInputTarget,
  normalizeCombo,
  type KeyLike,
} from "./keymap"

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
})

describe("comboFromEvent", () => {
  it("orders modifiers Ctrl, Alt, Shift and upper-cases letters", () => {
    expect(comboFromEvent(key("z", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+Z")
    expect(comboFromEvent(key("Z", { ctrlKey: true, shiftKey: true }))).toBe("Ctrl+Shift+Z")
    expect(comboFromEvent(key("s", { ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+S")
  })

  it("keeps named keys and maps space", () => {
    expect(comboFromEvent(key("Delete"))).toBe("Delete")
    expect(comboFromEvent(key("Escape"))).toBe("Escape")
    expect(comboFromEvent(key(" "))).toBe("Space")
  })

  it("ignores bare modifiers and Meta (OS-owned on Windows/Linux)", () => {
    expect(comboFromEvent(key("Control", { ctrlKey: true }))).toBeNull()
    expect(comboFromEvent(key("Shift", { shiftKey: true }))).toBeNull()
    expect(comboFromEvent(key("z", { metaKey: true }))).toBeNull()
  })
})

describe("normalizeCombo", () => {
  it("canonicalizes hand-written combos", () => {
    expect(normalizeCombo("shift+ctrl+z")).toBe("Ctrl+Shift+Z")
    expect(normalizeCombo("Ctrl + Y")).toBe("Ctrl+Y")
    expect(normalizeCombo("delete")).toBe("Delete")
    expect(normalizeCombo("ctrl+pageup")).toBe("Ctrl+PageUp")
    expect(normalizeCombo("F5")).toBe("F5")
  })

  it("throws on typos so a bad binding fails loudly", () => {
    expect(() => normalizeCombo("Ctrl+Delet")).toThrow(/Unknown key/)
    expect(() => normalizeCombo("Cmd+S")).toThrow(/Unknown modifier/)
  })
})

describe("isTextInputTarget", () => {
  it("detects text fields but not buttons, checkboxes or sliders", () => {
    const make = (tag: string, type?: string) => {
      const el = document.createElement(tag)
      if (type) el.setAttribute("type", type)
      return el
    }
    expect(isTextInputTarget(make("input", "text"))).toBe(true)
    expect(isTextInputTarget(make("input", "number"))).toBe(true)
    expect(isTextInputTarget(make("textarea"))).toBe(true)
    expect(isTextInputTarget(make("input", "checkbox"))).toBe(false)
    expect(isTextInputTarget(make("input", "range"))).toBe(false)
    expect(isTextInputTarget(make("button"))).toBe(false)
    expect(isTextInputTarget(null)).toBe(false)
  })
})

describe("isOverlayTarget", () => {
  it("detects targets inside menus and dialogs", () => {
    const menu = document.createElement("div")
    menu.setAttribute("role", "menu")
    const item = document.createElement("div")
    menu.append(item)
    expect(isOverlayTarget(item)).toBe(true)
    expect(isOverlayTarget(document.createElement("div"))).toBe(false)
    expect(isOverlayTarget(null)).toBe(false)
  })

  it("does not treat the menu bar as an overlay", () => {
    const bar = document.createElement("div")
    bar.setAttribute("role", "menubar")
    const trigger = document.createElement("button")
    bar.append(trigger)
    expect(isOverlayTarget(trigger)).toBe(false)
    expect(isMenubarTarget(trigger)).toBe(true)
  })
})
