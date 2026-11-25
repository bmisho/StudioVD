import { crc32, deflateRawSync } from "node:zlib"

/**
 * Writes zips the app's strict reader (`src-tauri/src/bundle/guard.rs`) accepts, as its own
 * writer does: local entries back to back from byte 0, then the central directory, then a
 * 22-byte end record; sizes and CRC in every local header (no data descriptors), no ZIP64, no
 * extra fields or comments, Unix regular files 0644, timestamps 1980-01-01 00:00, the
 * caller's order. Same inputs, same bytes (for one zlib).
 */
export interface ZipEntry {
  name: string
  data: Uint8Array
  /** Deflate (JSON, GLB, text) or store (PNG is compressed already). */
  deflate: boolean
}

const NAME = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/
const MAX_NAME = 200 // the app's pack limit
/** DOS device names: Windows opens the device, so the app refuses them as any component. */
const DEVICE = /^(con|prn|aux|nul|conin\$|conout\$|com\d|lpt\d)$/i

/** Whether the app's reader takes `name`: safe ASCII, no dot-edged or device components. */
export function goodEntryName(name: string): boolean {
  return (
    name.length <= MAX_NAME &&
    NAME.test(name) &&
    name
      .split("/")
      .every((c) => !c.startsWith(".") && !c.endsWith(".") && !DEVICE.test(c.split(".")[0] ?? ""))
  )
}
const DOS_DATE = (0 << 9) | (1 << 5) | 1 // 1980-01-01
const UNIX_FILE_0644 = (0o100644 << 16) >>> 0
const MADE_BY_UNIX = (3 << 8) | 20

/** The bytes of a zip holding `entries`; refuses names the reader would refuse. */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const seen = new Set<string>()
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const key = e.name.toLowerCase()
    if (!goodEntryName(e.name)) throw new Error(`zip: bad entry name ${JSON.stringify(e.name)}`)
    if (seen.has(key)) throw new Error(`zip: ${e.name} twice`)
    seen.add(key)
    const name = Buffer.from(e.name, "ascii")
    const body = e.deflate ? deflateRawSync(e.data, { level: 6 }) : Buffer.from(e.data)
    const crc = crc32(e.data) >>> 0
    if (offset + 30 + name.length + body.length > 0xfffffffe) throw new Error("zip: too large")

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags: no descriptor, not encrypted
    local.writeUInt16LE(e.deflate ? 8 : 0, 8)
    local.writeUInt16LE(0, 10) // time 00:00:00
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // no extra field

    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50, 0)
    record.writeUInt16LE(MADE_BY_UNIX, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(0, 8)
    record.writeUInt16LE(e.deflate ? 8 : 0, 10)
    record.writeUInt16LE(0, 12)
    record.writeUInt16LE(DOS_DATE, 14)
    record.writeUInt32LE(crc, 16)
    record.writeUInt32LE(body.length, 20)
    record.writeUInt32LE(e.data.length, 24)
    record.writeUInt16LE(name.length, 28)
    // extra, comment, disk start, internal attributes: 0
    record.writeUInt32LE(UNIX_FILE_0644, 38)
    record.writeUInt32LE(offset, 42)

    locals.push(local, name, body)
    central.push(record, name)
    offset += 30 + name.length + body.length
  }
  if (entries.length === 0 || entries.length > 0xfffe) throw new Error("zip: entry count")
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...locals, directory, end]))
}

/** Uncompressed bytes of all entries (the index's `uncompressedBytes`). */
export const unpackedBytes = (entries: readonly ZipEntry[]): number =>
  entries.reduce((n, e) => n + e.data.length, 0)
