import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import type { GroupId, PartId } from "@/core/schema"
import type { SceneTreeNode } from "@/core/scene/sceneTree"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { SceneTree } from "./SceneTree"

const g = (id: string, children: SceneTreeNode[] = []): SceneTreeNode => ({
  kind: "group",
  id: id as GroupId,
  name: id,
  children,
})
const p = (id: string): SceneTreeNode => ({ kind: "part", id: id as PartId, name: id })

// arm ─┬─ base
//      └─ gripper (part)
// bolt (part)
const tree = [g("arm", [g("base"), p("gripper")]), p("bolt")]

const item = (name: string) => screen.getByRole("treeitem", { name })
const selectedIds = () => useSessionStore.getState().selection.map((s) => s.id)
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init })

describe("SceneTree", () => {
  beforeEach(resetStores)

  it("exposes a multi-select tree with levels and a single tab stop", () => {
    render(<SceneTree tree={tree} />)
    expect(screen.getByRole("tree")).toHaveAttribute("aria-multiselectable", "true")
    expect(item("gripper")).toHaveAttribute("aria-level", "2")
    expect(item("gripper")).toHaveAttribute("aria-posinset", "2")
    expect(item("arm")).toHaveAttribute("aria-expanded", "true")
    expect(item("bolt")).not.toHaveAttribute("aria-expanded")
    const stops = screen.getAllByRole("treeitem").filter((el) => el.tabIndex === 0)
    expect(stops).toEqual([item("arm")])
  })

  it("moves focus and selection with the arrow keys", () => {
    render(<SceneTree tree={tree} />)
    act(() => item("arm").focus())
    press("ArrowDown")
    expect(item("base")).toHaveFocus()
    expect(selectedIds()).toEqual(["base"])
    press("End")
    expect(item("bolt")).toHaveFocus()
    expect(item("bolt")).toHaveAttribute("tabindex", "0")
    press("Home")
    expect(item("arm")).toHaveFocus()
  })

  it("collapses, expands and steps to the parent", () => {
    render(<SceneTree tree={tree} />)
    act(() => item("gripper").focus())
    press("ArrowLeft") // part: focus the parent group
    expect(item("arm")).toHaveFocus()
    press("ArrowLeft") // expanded group: collapse it
    expect(item("arm")).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("treeitem", { name: "base" })).not.toBeInTheDocument()
    press("ArrowRight")
    expect(item("arm")).toHaveAttribute("aria-expanded", "true")
    press("ArrowRight") // expanded group: first child
    expect(item("base")).toHaveFocus()
  })

  it("moves focus without selecting under Ctrl, and toggles with Ctrl+Space", () => {
    render(<SceneTree tree={tree} />)
    act(() => item("arm").focus())
    press(" ")
    expect(selectedIds()).toEqual(["arm"])
    press("End", { ctrlKey: true })
    expect(item("bolt")).toHaveFocus()
    expect(selectedIds()).toEqual(["arm"])
    press(" ", { ctrlKey: true })
    expect(selectedIds()).toEqual(["arm", "bolt"])
    expect(item("bolt")).toHaveAttribute("aria-selected", "true")
    press(" ", { ctrlKey: true })
    expect(selectedIds()).toEqual(["arm"])
  })

  it("lets Delete and Escape bubble to the app shortcuts", () => {
    render(<SceneTree tree={tree} />)
    act(() => item("arm").focus())
    for (const key of ["Delete", "Escape"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      act(() => {
        item("arm").dispatchEvent(event)
      })
      expect(event.defaultPrevented).toBe(false)
    }
  })

  it("makes the first selected row the tab stop", () => {
    useSessionStore.setState({ selection: [{ kind: "part", id: "bolt" as PartId }] })
    render(<SceneTree tree={tree} />)
    expect(item("bolt")).toHaveAttribute("tabindex", "0")
    expect(item("arm")).toHaveAttribute("tabindex", "-1")
  })
})
