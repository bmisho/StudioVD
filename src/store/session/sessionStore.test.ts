import { describe, expect, it } from "vitest"
import { createSessionStore } from "./sessionStore"

describe("session store", () => {
  it("toggles view state", () => {
    const store = createSessionStore()
    const s = () => store.getState()
    s().toggleProjection()
    expect(s().projection).toBe("orthographic")
    s().toggleSplitOrientation()
    expect(s().splitOrientation).toBe("vertical")
    s().toggleMaximize("viewport")
    expect(s().maximizedPane).toBe("viewport")
    s().toggleMaximize("schematic")
    expect(s().maximizedPane).toBe("schematic")
    s().toggleMaximize("schematic")
    expect(s().maximizedPane).toBeNull()
  })

  it("manages tool, test mode and dialogs", () => {
    const store = createSessionStore()
    const s = () => store.getState()
    s().setTool("mate")
    expect(s().activeTool).toBe("mate")
    s().toggleTestMode()
    expect(s().testMode).toBe(true)
    s().openDialog("about")
    expect(s().dialog).toBe("about")
    s().closeDialog()
    expect(s().dialog).toBeNull()
  })
})
