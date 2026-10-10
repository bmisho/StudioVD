import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PanelErrorBoundary } from "./PanelErrorBoundary"

let shouldThrow = true
function Flaky() {
  if (shouldThrow) throw new Error("solver exploded")
  return <p>Schematic content</p>
}

describe("PanelErrorBoundary", () => {
  it("contains a crash to its panel and can reload it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const user = userEvent.setup()
    render(
      <>
        <PanelErrorBoundary panelName="Schematic">
          <Flaky />
        </PanelErrorBoundary>
        <PanelErrorBoundary panelName="3D View">
          <p>Viewport content</p>
        </PanelErrorBoundary>
      </>
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Schematic stopped working")
    expect(screen.getByRole("alert")).toHaveTextContent("solver exploded")
    expect(screen.getByText("Viewport content")).toBeInTheDocument()

    shouldThrow = false
    await user.click(screen.getByRole("button", { name: /Reload panel/ }))
    expect(screen.getByText("Schematic content")).toBeInTheDocument()
  })
})
