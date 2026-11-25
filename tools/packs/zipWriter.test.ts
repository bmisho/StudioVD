import { inflateRawSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { goodEntryName, writeZip } from "./zipWriter"

const enc = (s: string) => new TextEncoder().encode(s)

/** Reads back what the app's reader checks: layout, records, sizes and contents. */
function readBack(zip: Uint8Array) {
  const b = Buffer.from(zip)
  const end = b.length - 22
  expect(b.readUInt32LE(end)).toBe(0x06054b50)
  const count = b.readUInt16LE(end + 10)
  const cdSize = b.readUInt32LE(end + 12)
  const cdOffset = b.readUInt32LE(end + 16)
  expect(cdOffset + cdSize).toBe(end) // the directory fills the space up to the end record
  const out: { name: string; data: Buffer }[] = []
  let at = 0
  let cd = cdOffset
  for (let i = 0; i < count; i++) {
    expect(b.readUInt32LE(cd)).toBe(0x02014b50)
    expect(b.readUInt32LE(cd + 42)).toBe(at) // entries back to back from byte 0
    expect(b.readUInt32LE(cd + 38) >>> 16).toBe(0o100644)
    expect(b.readUInt32LE(at)).toBe(0x04034b50)
    expect(b.readUInt16LE(at + 6)).toBe(0) // no data descriptor
    const method = b.readUInt16LE(at + 8)
    const size = b.readUInt32LE(at + 18)
    const nameLen = b.readUInt16LE(at + 26)
    expect(b.readUInt16LE(at + 28)).toBe(0)
    const name = b.toString("ascii", at + 30, at + 30 + nameLen)
    const body = b.subarray(at + 30 + nameLen, at + 30 + nameLen + size)
    out.push({ name, data: method === 8 ? inflateRawSync(body) : body })
    at += 30 + nameLen + size
    cd += 46 + nameLen
  }
  expect(at).toBe(cdOffset)
  return out
}

describe("pack zips the app's reader accepts (PLAN 14.7)", () => {
  it("writes contiguous entries, stored or deflated, and reads them back", () => {
    const zip = writeZip([
      { name: "pack.json", data: enc('{"a":1}'), deflate: true },
      {
        name: "components/official/x/1.0.0/thumbnail.png",
        data: new Uint8Array([1, 2, 3]),
        deflate: false,
      },
    ])
    expect(readBack(zip).map((e) => [e.name, [...e.data]])).toEqual([
      ["pack.json", [...enc('{"a":1}')]],
      ["components/official/x/1.0.0/thumbnail.png", [1, 2, 3]],
    ])
    expect(writeZip([{ name: "a", data: enc("x"), deflate: true }])).toEqual(
      writeZip([{ name: "a", data: enc("x"), deflate: true }])
    )
  })

  it("refuses names the app refuses, and names that differ only by case", () => {
    for (const bad of [
      "../x",
      "/x",
      "a\\b",
      "a/.x",
      "a/x.",
      "components/aux/1.0.0/c.json",
      "com1.txt",
      "é",
      "a".repeat(201),
    ])
      expect(goodEntryName(bad), bad).toBe(false)
    expect(goodEntryName("components/official/led-5mm/1.0.0/component.json")).toBe(true)
    expect(() =>
      writeZip([
        { name: "A", data: enc("x"), deflate: false },
        { name: "a", data: enc("y"), deflate: false },
      ])
    ).toThrow("twice")
  })
})
