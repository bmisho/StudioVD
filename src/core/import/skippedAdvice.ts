/** Native CAD formats StudioVD cannot read, by extension: which tool wrote them. */
const NATIVE: Readonly<Record<string, string>> = {
  sldprt: "SolidWorks",
  sldasm: "SolidWorks",
  slddrw: "SolidWorks",
  ipt: "Inventor",
  iam: "Inventor",
  f3d: "Fusion",
  f3z: "Fusion",
  catpart: "CATIA",
  catproduct: "CATIA",
  prt: "Creo or NX",
  asm: "Creo",
  par: "Solid Edge",
  psm: "Solid Edge",
  x_t: "Parasolid",
  x_b: "Parasolid",
  "3dm": "Rhino",
  skp: "SketchUp",
  fcstd: "FreeCAD",
  dwg: "AutoCAD",
}

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".")
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase()
}

/**
 * The notice for files a pick, drop or downloaded zip left out (PLAN 16.5): their names, and
 * when some are native CAD files, which tools wrote them and to export STEP instead.
 */
export function skippedMessage(names: readonly string[]): string {
  const tools = [
    ...new Set(
      names
        .map(extensionOf)
        .filter((e) => Object.hasOwn(NATIVE, e))
        .map((e) => NATIVE[e])
    ),
  ]
  const lines = [...names]
  if (tools.length > 0)
    lines.push(
      "",
      `${tools.join(", ")} files cannot be read: export them as STEP (download sites such as GrabCAD usually offer STEP too).`
    )
  return lines.join("\n")
}
