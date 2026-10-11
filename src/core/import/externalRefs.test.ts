import { describe, expect, it } from "vitest"
import { decodeUri, gltfBufferUris, objMaterialLibraries } from "./externalRefs"

const bytes = (s: string) => new TextEncoder().encode(s)

describe("external references", () => {
  it("finds OBJ material libraries on their own lines only", () => {
    const obj =
      "# mtllib commented.mtl\nmtllib first.mtl\r\nv 0 0 0\nmtllib my parts.mtl\nmtllibx no.mtl\nmtllib first.mtl"
    expect(objMaterialLibraries(bytes(obj))).toEqual(["first.mtl", "my parts.mtl"])
    expect(objMaterialLibraries(bytes("mtllib\ta.mtl"))).toEqual(["a.mtl"])
    expect(objMaterialLibraries(bytes("v 1 2 3\n"))).toEqual([])
  })

  it("lists external glTF buffers, decoded, without data URIs", () => {
    const json = {
      buffers: [
        { uri: "scene%20data.bin" },
        { uri: "data:application/octet-stream;base64,AAAA" },
        { byteLength: 4 },
        { uri: "scene%20data.bin" },
        { uri: "bad%E0.bin" },
      ],
    }
    expect(gltfBufferUris(json)).toEqual(["scene data.bin", "bad%E0.bin"])
    expect(gltfBufferUris(null)).toEqual([])
    expect(gltfBufferUris({ buffers: "nope" })).toEqual([])
    expect(decodeUri("a%2Fb")).toBe("a/b")
  })
})
