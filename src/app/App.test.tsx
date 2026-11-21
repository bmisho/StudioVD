import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import { resetStores } from "@/test/resetStores"
import { useDocumentStore } from "@/store/document/documentStore"
import { App } from "./App"

const groupNames = () => Object.values(useDocumentStore.getState().doc.groups).map((g) => g.name)

// jsdom gives every element a 0x0 rect at (0,0), so react-resizable-panels treats any
// simulated pointer press as hitting a resize handle and moves focus there. Text inputs are
// therefore focused programmatically here; tests/e2e covers the real-mouse version.
const focus = (el: HTMLElement) => act(() => el.focus())

describe("App shell", () => {
  beforeEach(resetStores)

  it("renders every region of the layout", () => {
    render(<App />)
    expect(screen.getByRole("menubar", { name: "Main menu" })).toBeInTheDocument()
    for (const menu of ["File", "Edit", "View", "Help"]) {
      expect(screen.getByRole("menuitem", { name: menu })).toBeInTheDocument()
    }
    expect(screen.getByRole("toolbar", { name: "Main toolbar" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Scene" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Library" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "3D View" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Schematic" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Properties" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Scene and Library" })).toBeInTheDocument()
    expect(screen.getByRole("main", { name: "Workspace" })).toBeInTheDocument()
    // dom-testing-library also counts pane <header>s inside <section> as banners (browsers
    // don't), so check the app header by position: it comes first.
    expect(screen.getAllByRole("banner")[0]).toContainElement(screen.getByRole("menubar"))
    expect(screen.getByRole("contentinfo", { name: "Status bar" })).toBeInTheDocument()
  })

  it("creates a group, then undoes and redoes it with the keyboard", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "New group" }))
    const tree = screen.getByRole("tree", { name: "Scene graph" })
    expect(within(tree).getByText("Group 1")).toBeInTheDocument()

    await user.keyboard("{Control>}z{/Control}")
    expect(groupNames()).toEqual([])
    expect(screen.queryByRole("tree", { name: "Scene graph" })).not.toBeInTheDocument()

    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}")
    expect(groupNames()).toEqual(["Group 1"])
  })

  it("renames through Properties as a single undo entry", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "New group" }))
    const input = screen.getByLabelText("Name")
    await user.clear(input)
    await user.keyboard("Gearbox")
    expect(groupNames()).toEqual(["Gearbox"]) // live while typing
    await user.keyboard("{Enter}")

    // Typing must not trigger app shortcuts; one undo reverts the whole rename.
    expect(useDocumentStore.temporal.getState().pastStates).toHaveLength(2)
    await user.keyboard("{Control>}z{/Control}")
    expect(groupNames()).toEqual(["Group 1"])
  })

  it("reverts a rename with Escape and records nothing", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "New group" }))
    const input = screen.getByLabelText("Name")
    focus(input)
    await user.keyboard("{End} typo")
    expect(groupNames()).toEqual(["Group 1 typo"])
    await user.keyboard("{Escape}")
    expect(groupNames()).toEqual(["Group 1"])
    expect(useDocumentStore.temporal.getState().pastStates).toHaveLength(1)
  })

  it("deletes the selected group with the Delete key", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "New group" }))
    await user.click(screen.getByText("Group 1"))
    await user.keyboard("{Delete}")
    expect(groupNames()).toEqual([])
  })

  it("forgets a selection that undo removed, so Ctrl+G does not nest in a ghost", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "New group" })) // selected
    await user.keyboard("{Control>}z{/Control}")
    expect(screen.getByRole("contentinfo", { name: "Status bar" })).toHaveTextContent("Selected 0")
    await user.keyboard("{Control>}g{/Control}")
    const groups = Object.values(useDocumentStore.getState().doc.groups)
    expect(groups.map((g) => g.parentId)).toEqual([null])
  })

  it("maximizes and restores the 3D view from its pane header", async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole("button", { name: "Maximize 3D View" }))
    expect(screen.getByRole("button", { name: "Restore 3D View" })).toBeInTheDocument()
    // Both panes stay mounted (the 3D canvas must survive maximize).
    expect(await screen.findByTestId("schematic-editor")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Restore 3D View" }))
    expect(screen.getByRole("button", { name: "Maximize 3D View" })).toBeInTheDocument()
  })
})
