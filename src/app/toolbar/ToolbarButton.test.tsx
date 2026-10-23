import { act, render, screen } from "@testing-library/react"
import { Anchor } from "lucide-react"
import { Toolbar } from "radix-ui"
import { beforeEach, describe, expect, it } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { ToolbarButton } from "./ToolbarButton"

describe("ToolbarButton", () => {
  beforeEach(resetStores)

  it("says in its tooltip how to enable a disabled command", async () => {
    act(() => useSessionStore.getState().toggleTestMode())
    render(
      <TooltipProvider>
        <Toolbar.Root>
          <ToolbarButton command="tool.anchor" icon={Anchor} />
        </Toolbar.Root>
      </TooltipProvider>
    )
    const button = screen.getByRole("button", { name: "Place Anchor" })
    expect(button).toHaveAttribute("aria-disabled", "true")
    act(() => button.focus())
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Place Anchor: leave test mode first"
    )
  })
})
