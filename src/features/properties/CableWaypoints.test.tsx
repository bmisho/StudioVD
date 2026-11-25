import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { ConnectorId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useAnchorTarget } from "@/store/session/anchorTargetStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { resetStores } from "@/test/resetStores"
import { CableWaypoints } from "./CableWaypoints"

/** A cable between the test rig's two hinge anchors. */
function setup() {
  const rig = createTestRig()
  useDocumentStore.getState().insertEntities(rig)
  const [a, b] = rig.anchors
  if (!a || !b) throw new Error("rig incomplete")
  const id = useDocumentStore.getState().addConnector("cable", [a.id, b.id]) as ConnectorId
  return { id, a }
}

const cableOf = (id: ConnectorId) => {
  const c = useDocumentStore.getState().doc.connectors[id]
  if (c?.kind !== "cable") throw new Error("not a cable")
  return c
}

describe("CableWaypoints", () => {
  beforeEach(resetStores)

  it("starts and ends laying waypoints by clicking in the 3D view (0.2.1)", () => {
    const { id } = setup()
    const { rerender } = render(<CableWaypoints cable={cableOf(id)} />)
    const button = screen.getByRole("button", { name: "Add waypoints by clicking" })
    expect(button).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(button)
    expect(useAnchorTarget.getState().target).toEqual({ kind: "route", cable: id })
    expect(useSessionStore.getState().activeTool).toBe("anchor")
    rerender(<CableWaypoints cable={cableOf(id)} />)
    expect(button).toHaveAttribute("aria-pressed", "true")
    fireEvent.click(button)
    expect(useSessionStore.getState().activeTool).toBe("select")
    expect(useAnchorTarget.getState().target).toBeNull()
  })

  it("places a waypoint again on its part", () => {
    const { id, a } = setup()
    const clip = useDocumentStore.getState().addAnchor({
      partId: a.partId,
      kind: "point",
      frame: { originMm: [0, 20, 0], z: [0, 1, 0], x: [1, 0, 0] },
      source: { kind: "manual" },
      name: "Clip",
    })
    if (!clip) throw new Error("no anchor")
    useDocumentStore.getState().setCableVia(id, [clip])
    render(<CableWaypoints cable={cableOf(id)} />)
    fireEvent.click(screen.getByRole("button", { name: "Place waypoint 1 again" }))
    expect(useAnchorTarget.getState().target).toEqual({ kind: "move", anchor: clip })
  })
})
