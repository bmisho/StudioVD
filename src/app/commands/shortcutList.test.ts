import { describe, expect, it } from "vitest"
import { shortcutGroups } from "./shortcutList"
import type { Command } from "./types"

const command = (id: string, label: string, shortcuts?: string[]) =>
  ({ id, label, run: () => undefined, ...(shortcuts && { shortcuts }) }) as unknown as Command

describe("keyboard shortcuts list (PLAN 15.4)", () => {
  it("groups commands with keys as the menus do, and skips the rest", () => {
    const groups = shortcutGroups([
      command("view.fitAll", "Fit All", ["F", "Home"]),
      command("file.save", "Save", ["Ctrl+S"]),
      command("view.toggleProjection", "Orthographic Projection"),
      command("transform.translate", "Move", ["T"]),
      command("dev.thing", "Thing", ["Ctrl+Alt+D"]),
    ])
    expect(groups.map((g) => g.title)).toEqual(["File", "Edit", "View", "Other"])
    expect(groups[2]?.rows).toEqual([{ label: "Fit All", keys: ["F", "Home"] }])
  })
})
