import { describe, expect, it } from "vitest"
import { skippedMessage } from "./skippedAdvice"

describe("skipped files notice (PLAN 16.5)", () => {
  it("names native CAD tools and says to export STEP", () => {
    expect(skippedMessage(["Pedal.zip: Pedal.SLDASM", "Pedal.zip: knob.ipt", "base.SLDPRT"])).toBe(
      [
        "Pedal.zip: Pedal.SLDASM",
        "Pedal.zip: knob.ipt",
        "base.SLDPRT",
        "",
        "SolidWorks, Inventor files cannot be read: export them as STEP (download sites such as GrabCAD usually offer STEP too).",
      ].join("\n")
    )
  })

  it("just lists other files", () => {
    expect(skippedMessage(["readme.pdf", "folder"])).toBe("readme.pdf\nfolder")
    // A record also "has" its prototype's keys: never a tool name.
    expect(skippedMessage(["x.constructor", "y.toString"])).toBe("x.constructor\ny.toString")
  })
})
