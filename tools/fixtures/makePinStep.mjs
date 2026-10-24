// Writes tests/fixtures/pin.step: a Ø8 x 20 mm pin (fits the hole of plate-hole.step), as an
// AP214 advanced B-rep (two planes, a cylinder, circles), written from scratch for StudioVD's
// tests (CC0-1.0). Run: node tools/fixtures/makePinStep.mjs
//
// Built Z-up (axis +z, 0..20, at x = 40 so it stands clear of the plate), then written turned
// -90° about x like the plate: in StudioVD's Y-up world it stands upright on y = 0..20 at
// x = 40, z = 0. The side is two half-cylinder faces (as the plate's bore): 4 vertices,
// 6 edges, 4 faces, 4 loops, genus 0.
import { writeFileSync } from "node:fs"

const PIN = { x: 40, y: 0, r: 4, length: 20 }

/** Z-up -> Y-up: (x, y, z) -> (x, z, -y), a proper rotation (loop orientations are kept). */
const turn = ([x, y, z]) => [x, z, -y]
const num = (v) => (Object.is(v, -0) ? 0 : v).toFixed(4)

export function pinStep(fileName = "pin.step") {
  const lines = []
  let id = 0
  const add = (text) => {
    id += 1
    lines.push(`#${id}=${text};`)
    return `#${id}`
  }
  const point = (p) => add(`CARTESIAN_POINT('',(${turn(p).map(num).join(",")}))`)
  const dir = (d) => add(`DIRECTION('',(${turn(d).map(num).join(",")}))`)
  const place = (origin, z, x) => add(`AXIS2_PLACEMENT_3D('',${point(origin)},${dir(z)},${dir(x)})`)
  const T = PIN.length

  // Vertices on the +x and -x side of each end circle.
  const v = {}
  for (const z of [0, T]) {
    for (const [name, x] of [
      [`p+${z}`, PIN.x + PIN.r],
      [`p-${z}`, PIN.x - PIN.r],
    ]) {
      const p = [x, PIN.y, z]
      v[name] = { p, ref: add(`VERTEX_POINT('',${point(p)})`) }
    }
  }
  // The two straight seams, stored once; `use(a, b)` orients one along a -> b.
  const seams = new Map()
  const use = (a, b) => {
    const key = [a, b].sort().join("|")
    let edge = seams.get(key)
    if (!edge) {
      const [pa, pb] = [v[a].p, v[b].p]
      const d = pb.map((x, i) => x - pa[i])
      const len = Math.hypot(...d)
      const vec = add(`VECTOR('',${dir(d.map((x) => x / len))},${num(len)})`)
      const line = add(`LINE('',${point(pa)},${vec})`)
      edge = { from: a, ref: add(`EDGE_CURVE('',${v[a].ref},${v[b].ref},${line},.T.)`) }
      seams.set(key, edge)
    }
    return add(`ORIENTED_EDGE('',*,*,${edge.ref},${edge.from === a ? ".T." : ".F."})`)
  }
  // Half circles, counter-clockwise about +z (the circle's own sense): from -> to.
  const arc = (z, from, to) => {
    const circle = add(`CIRCLE('',${place([PIN.x, PIN.y, z], [0, 0, 1], [1, 0, 0])},${num(PIN.r)})`)
    return add(`EDGE_CURVE('',${v[from].ref},${v[to].ref},${circle},.T.)`)
  }
  const oriented = (edge, sense) => add(`ORIENTED_EDGE('',*,*,${edge},${sense ? ".T." : ".F."})`)
  const arcs = {
    top1: arc(T, `p+${T}`, `p-${T}`), // through +y
    top2: arc(T, `p-${T}`, `p+${T}`), // through -y
    bot1: arc(0, "p+0", "p-0"),
    bot2: arc(0, "p-0", "p+0"),
  }
  const loop = (edges) => add(`EDGE_LOOP('',(${edges.join(",")}))`)
  const outer = (l) => add(`FACE_OUTER_BOUND('',${l},.T.)`)
  const plane = (origin, normal) => add(`PLANE('',${place(origin, normal, [1, 0, 0])})`)
  const face = (l, surface) => add(`ADVANCED_FACE('',(${outer(l)}),${surface},.T.)`)
  const side = add(
    `CYLINDRICAL_SURFACE('',${place([PIN.x, PIN.y, 0], [0, 0, 1], [1, 0, 0])},${num(PIN.r)})`
  )

  // Every loop counter-clockwise seen from outside (the faces point away from the pin).
  const faces = [
    face(
      loop([oriented(arcs.top1, true), oriented(arcs.top2, true)]),
      plane([PIN.x, PIN.y, T], [0, 0, 1])
    ),
    face(
      loop([oriented(arcs.bot1, false), oriented(arcs.bot2, false)]),
      plane([PIN.x, PIN.y, 0], [0, 0, -1])
    ),
    face(
      loop([
        use("p-0", `p-${T}`),
        oriented(arcs.top1, false),
        use(`p+${T}`, "p+0"),
        oriented(arcs.bot1, true),
      ]),
      side
    ),
    face(
      loop([
        use("p+0", `p+${T}`),
        oriented(arcs.top2, false),
        use(`p-${T}`, "p-0"),
        oriented(arcs.bot2, true),
      ]),
      side
    ),
  ]

  const shell = add(`CLOSED_SHELL('',(${faces.join(",")}))`)
  const solid = add(`MANIFOLD_SOLID_BREP('Pin',${shell})`)
  const ctx = add(
    "(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#U)) GLOBAL_UNIT_ASSIGNED_CONTEXT((#MM,#RAD,#SR)) REPRESENTATION_CONTEXT('',''))"
  )
  const mm = add("(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))")
  const rad = add("(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))")
  const sr = add("(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())")
  const unc = add(
    `UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${mm},'distance_accuracy_value','')`
  )
  const origin = add(
    `AXIS2_PLACEMENT_3D('',${add("CARTESIAN_POINT('',(0.,0.,0.))")},${add("DIRECTION('',(0.,0.,1.))")},${add("DIRECTION('',(1.,0.,0.))")})`
  )
  const shapeRep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('Pin',(${origin},${solid}),${ctx})`)
  const appCtx = add("APPLICATION_CONTEXT('automotive design')")
  add(
    `APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`
  )
  const prodCtx = add(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`)
  const product = add(`PRODUCT('Pin','Pin','',(${prodCtx}))`)
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
FILE_DESCRIPTION(('StudioVD test fixture: a pin'),'2;1');
FILE_NAME('${fileName}','2026-10-24T00:00:00',('StudioVD'),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
${body}
ENDSEC;
END-ISO-10303-21;
`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("../../tests/fixtures/pin.step", import.meta.url), pinStep())
  console.log("wrote tests/fixtures/pin.step")
}
