// Writes tests/fixtures/cube.step: a 10 mm cube as an AP214 faceted B-rep, written from
// scratch for StudioVD's tests (CC0-1.0). Run: node tools/fixtures/makeCubeStep.mjs
import { writeFileSync } from "node:fs"

export function cubeStep(size = 10) {
  const lines = []
  let id = 0
  const add = (text) => {
    id += 1
    lines.push(`#${id}=${text};`)
    return `#${id}`
  }
  const h = size / 2
  const corners = []
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) corners.push([x, y, z])
  const pts = corners.map((c) =>
    add(`CARTESIAN_POINT('',(${c.map((v) => v.toFixed(3)).join(",")}))`)
  )
  // Each face: 4 corner indices in counter-clockwise order seen from outside (bits: x y z).
  const faces = [
    [0, 1, 3, 2], // -x
    [4, 6, 7, 5], // +x
    [0, 4, 5, 1], // -y
    [2, 3, 7, 6], // +y
    [0, 2, 6, 4], // -z
    [1, 5, 7, 3], // +z
  ]
  // Outward normal and an in-plane reference direction per face, for its supporting PLANE.
  const axes = [
    ["-1.,0.,0.", "0.,1.,0."],
    ["1.,0.,0.", "0.,1.,0."],
    ["0.,-1.,0.", "0.,0.,1."],
    ["0.,1.,0.", "0.,0.,1."],
    ["0.,0.,-1.", "1.,0.,0."],
    ["0.,0.,1.", "1.,0.,0."],
  ]
  const faceRefs = faces.map((f, k) => {
    const loop = add(`POLY_LOOP('',(${f.map((i) => pts[i]).join(",")}))`)
    const bound = add(`FACE_OUTER_BOUND('',${loop},.T.)`)
    const [n, ref] = axes[k]
    const normal = add(`DIRECTION('',(${n}))`)
    const refDir = add(`DIRECTION('',(${ref}))`)
    const place = add(`AXIS2_PLACEMENT_3D('',${pts[f[0]]},${normal},${refDir})`)
    const plane = add(`PLANE('',${place})`)
    return add(`FACE_SURFACE('',(${bound}),${plane},.T.)`)
  })
  const shell = add(`CLOSED_SHELL('',(${faceRefs.join(",")}))`)
  const brep = add(`FACETED_BREP('Cube',${shell})`)
  const ctx = add(
    "(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#U)) GLOBAL_UNIT_ASSIGNED_CONTEXT((#MM,#RAD,#SR)) REPRESENTATION_CONTEXT('',''))"
  )
  const mm = add("(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))")
  const rad = add("(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))")
  const sr = add("(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())")
  const unc = add(
    `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${mm},'distance_accuracy_value','')`
  )
  const origin = add("CARTESIAN_POINT('',(0.,0.,0.))")
  const zDir = add("DIRECTION('',(0.,0.,1.))")
  const xDir = add("DIRECTION('',(1.,0.,0.))")
  const placement = add(`AXIS2_PLACEMENT_3D('',${origin},${zDir},${xDir})`)
  const shapeRep = add(`FACETED_BREP_SHAPE_REPRESENTATION('Cube',(${placement},${brep}),${ctx})`)
  const appCtx = add("APPLICATION_CONTEXT('automotive design')")
  add(
    `APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`
  )
  const prodCtx = add(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`)
  const product = add(`PRODUCT('Cube','Cube','',(${prodCtx}))`)
  const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`)
  const defCtx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${appCtx},'design')`)
  const def = add(`PRODUCT_DEFINITION('design','',${formation},${defCtx})`)
  const pds = add(`PRODUCT_DEFINITION_SHAPE('','',${def})`)
  add(`SHAPE_DEFINITION_REPRESENTATION(${pds},${shapeRep})`)
  const body = lines
    .join("\n")
    .replace("#U", unc)
    .replace("#MM", mm)
    .replace("#RAD", rad)
    .replace("#SR", sr)
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('StudioVD test fixture: 10 mm cube'),'2;1');
FILE_NAME('cube.step','2026-10-11T00:00:00',('StudioVD'),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
${body}
ENDSEC;
END-ISO-10303-21;
`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("../../tests/fixtures/cube.step", import.meta.url), cubeStep())
  console.log("wrote tests/fixtures/cube.step")
}
