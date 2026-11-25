import { renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { CommandRegistry } from "@/app/commands/registry"
import type { Command } from "@/app/commands/types"
import { BROWSER_ONLY_KEYS, installNativeMenuGuard } from "./browserGuards"
import { buildShortcutMap, useGlobalShortcuts } from "./useGlobalShortcuts"

const rightClick = (on: Element) => {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 })
  on.dispatchEvent(e)
  return e.defaultPrevented
}
const registry = (list: Partial<Command>[] = []) =>
  ({ list, run: () => true }) as unknown as CommandRegistry

afterEach(() => document.body.replaceChildren())

describe("the webview's own menu and keys stay out of the app", () => {
  it("no native menu over the app's menus or anywhere else; text fields keep theirs", () => {
    // Windows sends contextmenu on the release, to the app's menu already under the pointer.
    const menu = document.body.appendChild(document.createElement("div"))
    menu.setAttribute("role", "menu")
    const input = document.body.appendChild(document.createElement("input"))
    expect(rightClick(menu)).toBe(false) // without the guard: WebView2 adds Back, Refresh…
    const remove = installNativeMenuGuard(window)
    expect(rightClick(menu)).toBe(true)
    expect(rightClick(input)).toBe(false)
    remove()
    expect(rightClick(menu)).toBe(false)
  })

  it("swallows reload, history and print keys; no command may bind them", () => {
    renderHook(() => useGlobalShortcuts(registry()))
    for (const [key, init] of [
      ["F5", {}],
      ["r", { ctrlKey: true }],
      ["ArrowLeft", { altKey: true }],
      ["p", { ctrlKey: true }],
    ] as const) {
      const e = new KeyboardEvent("keydown", { key, cancelable: true, bubbles: true, ...init })
      window.dispatchEvent(e)
      expect(e.defaultPrevented, key).toBe(true)
    }
    const plain = new KeyboardEvent("keydown", { key: "x", cancelable: true, bubbles: true })
    window.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(false)
    expect(BROWSER_ONLY_KEYS.has("Ctrl+R")).toBe(true)
    expect(() =>
      buildShortcutMap(registry([{ id: "x" as Command["id"], shortcuts: ["Ctrl+R"] }]))
    ).toThrow("webview")
  })
})
