import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { appCommands } from "@/app/commands/appCommands"
import { createTestRig } from "@/core/scene/testRig"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { PropertiesPanel } from "./PropertiesPanel"

/** The test rig in the app's stores: Base and Leaf with a hinge anchor each. */
function setup() {
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities(rig)
  const [base] = rig.parts
  const hinge = rig.anchors.find((a) => a.partId === base?.id)
  if (!base || !hinge) throw new Error("rig incomplete")
  return { base: base.id, hinge: hinge.id }
}

const nextFrame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))
const heading = (name: string) => screen.getByRole("heading", { name })
/** Focus is still in the panel, not dropped to <body>. */
function expectFocusIn(panel: HTMLElement) {
  expect(document.activeElement).not.toBe(document.body)
  expect(panel.contains(document.activeElement)).toBe(true)
}

describe("PropertiesPanel keeps keyboard focus", () => {
  beforeEach(resetStores)

  it("when a part's anchor row opens the anchor (focus then on its heading)", async () => {
    const { base } = setup()
    act(() => useSessionStore.getState().select([{ kind: "part", id: base }]))
    const { container } = render(<PropertiesPanel />)
    const row = screen.getByRole("button", { name: /^Hinge/ })
    act(() => row.focus())
    fireEvent.click(row)
    expectFocusIn(container)
    await nextFrame()
    expect(heading("Anchor")).toHaveFocus()
  })

  it("when Delete removes the anchor whose inspector had focus (its part is shown)", () => {
    const { base, hinge } = setup()
    act(() => useSessionStore.getState().select([{ kind: "anchor", id: hinge }]))
    const { container } = render(<PropertiesPanel />)
    act(() => screen.getByRole("button", { name: "Flip direction" }).focus())
    act(() => void appCommands.run("edit.delete"))
    expect(useSessionStore.getState().selection).toEqual([{ kind: "part", id: base }])
    expectFocusIn(container)
  })

  it("when the anchor's part name takes the user back to the part's anchor list", async () => {
    const { base, hinge } = setup()
    act(() => useSessionStore.getState().select([{ kind: "anchor", id: hinge }]))
    render(<PropertiesPanel />)
    const link = screen.getByRole("button", { name: "Base" })
    act(() => link.focus())
    fireEvent.click(link)
    expect(useSessionStore.getState().selection).toEqual([{ kind: "part", id: base }])
    await nextFrame()
    expect(heading("Anchors")).toHaveFocus()
  })
})
