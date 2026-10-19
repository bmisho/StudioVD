// Writes tests/fixtures/checker.png: a 64 x 64 two-colour checkerboard (8 px squares), RGB,
// written from scratch for StudioVD's tests (CC0-1.0). Run: node tools/fixtures/makeCheckerPng.mjs
import { writeFileSync } from "node:fs"
import { crc32, deflateSync } from "node:zlib"

export function checkerPng(size = 64, square = 8) {
  const raw = Buffer.alloc(size * (1 + 3 * size))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + 3 * size)] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const dark = (Math.floor(x / square) + Math.floor(y / square)) % 2 === 1
      raw.set(dark ? [40, 60, 90] : [235, 220, 190], y * (1 + 3 * size) + 1 + 3 * x)
    }
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, "ascii")
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
    return Buffer.concat([head, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 2, 0, 0, 0], 8) // 8-bit RGB, deflate, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("../../tests/fixtures/checker.png", import.meta.url), checkerPng())
  console.log("wrote tests/fixtures/checker.png")
}
