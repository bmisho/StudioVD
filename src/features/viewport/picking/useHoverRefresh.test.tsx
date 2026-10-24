import { afterEach, describe, expect, it } from "vitest"
import { demandRoot } from "@/test/demandRoot"
import { useHoverRefresh } from "./useHoverRefresh"

let fire = () => undefined as void
const source = (listener: () => void) => {
  fire = listener
  return () => {
    fire = () => undefined
  }
}

function Refresher() {
  useHoverRefresh({ refreshOn: source })
  return null
}

const roots: Awaited<ReturnType<typeof demandRoot>>[] = []
afterEach(async () => {
  for (const r of roots.splice(0)) await r.unmount()
})

describe("useHoverRefresh", () => {
  it("asks for a frame (whose hover replay picks up new snaps) when its source fires", async () => {
    const r = await demandRoot(<Refresher />)
    roots.push(r)
    expect(await r.framesRequested(() => fire())).toBeGreaterThan(0)
  })
})
