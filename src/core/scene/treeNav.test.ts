import { describe, expect, it } from "vitest"
import type { GroupId, PartId } from "@/core/schema"
import type { SceneTreeNode } from "./sceneTree"
import { treeMove, visibleRows } from "./treeNav"

const g = (id: string, children: SceneTreeNode[] = []): SceneTreeNode => ({
  kind: "group",
  id: id as GroupId,
  name: id,
  children,
})
const p = (id: string): SceneTreeNode => ({ kind: "part", id: id as PartId, name: id })

// arm ─┬─ base
//      └─ joint ── gripper
// bolt
const tree = [g("arm", [g("base"), g("joint", [p("gripper")])]), p("bolt")]

describe("visibleRows", () => {
  it("lists rows in visual order with levels and set positions", () => {
    const rows = visibleRows(tree, new Set())
    expect(rows.map((r) => `${r.node.id}@${r.level}:${r.posInSet}/${r.setSize}`)).toEqual([
      "arm@1:1/2",
      "base@2:1/2",
      "joint@2:2/2",
      "gripper@3:1/1",
      "bolt@1:2/2",
    ])
  })

  it("hides children of collapsed groups", () => {
    const rows = visibleRows(tree, new Set(["joint"]))
    expect(rows.map((r) => r.node.id)).toEqual(["arm", "base", "joint", "bolt"])
    expect(rows.find((r) => r.node.id === "joint")?.expanded).toBe(false)
  })
})

describe("treeMove", () => {
  const rows = visibleRows(tree, new Set())

  it("moves up and down and clamps at the ends", () => {
    expect(treeMove(rows, "arm", "ArrowDown")).toEqual({ type: "focus", id: "base" })
    expect(treeMove(rows, "base", "ArrowUp")).toEqual({ type: "focus", id: "arm" })
    expect(treeMove(rows, "arm", "ArrowUp")).toEqual({ type: "focus", id: "arm" })
    expect(treeMove(rows, "bolt", "ArrowDown")).toEqual({ type: "focus", id: "bolt" })
    expect(treeMove(rows, "joint", "Home")).toEqual({ type: "focus", id: "arm" })
    expect(treeMove(rows, "arm", "End")).toEqual({ type: "focus", id: "bolt" })
  })

  it("expands, enters, collapses and climbs with Right/Left", () => {
    const collapsedRows = visibleRows(tree, new Set(["joint"]))
    expect(treeMove(collapsedRows, "joint", "ArrowRight")).toEqual({ type: "expand", id: "joint" })
    expect(treeMove(rows, "joint", "ArrowRight")).toEqual({ type: "focus", id: "gripper" })
    expect(treeMove(rows, "joint", "ArrowLeft")).toEqual({ type: "collapse", id: "joint" })
    expect(treeMove(rows, "gripper", "ArrowLeft")).toEqual({ type: "focus", id: "joint" })
    expect(treeMove(rows, "bolt", "ArrowLeft")).toEqual({ type: "none" })
    expect(treeMove(rows, "base", "ArrowRight")).toEqual({ type: "none" })
  })

  it("starts at the first row when nothing is active", () => {
    expect(treeMove(rows, null, "ArrowDown")).toEqual({ type: "focus", id: "arm" })
    expect(treeMove([], null, "ArrowDown")).toEqual({ type: "none" })
  })
})
