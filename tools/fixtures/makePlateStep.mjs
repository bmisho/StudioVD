// Writes tests/fixtures/plate-hole.step: a 40 x 30 x 8 mm plate with a Ø8 mm through hole
// off its centre, as an AP214 advanced B-rep (planes, a cylinder, circles), written from
// scratch for StudioVD's tests (CC0-1.0). Run: node tools/fixtures/makePlateStep.mjs
//
// Built Z-up (thickness along z, hole axis +z), then written turned -90° about x, so the
// plate lies flat in StudioVD's Y-up world with the hole axis along +y. The hole is two
// half-cylinder faces (no seam edge): 12 vertices, 18 edges, 8 faces, 10 loops, genus 1.
import { writeFileSync } from "node:fs"

const [W, D, T] = [20, 15, 8] // half width (x), half depth (y), thickness (z)
const HOLE = { x: 5, y: 0, r: 4 }

/** Z-up -> Y-up: (x, y, z) -> (x, z, -y), a proper rotation (loop orientations are kept). */
const turn = ([x, y, z]) => [x, z, -y]
const num = (v) => (Object.is(v, -0) ? 0 : v).toFixed(4)

export function plateStep(fileName = "plate-hole.step") {
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

  // Vertices: box corners by name, hole points on the +x and -x side of each rim.
  const v = {}
  const vertex = (name, p) => {
    v[name] = { p, ref: add(`VERTEX_POINT('',${point(p)})`) }
  }
  for (const [sx, sy, sz] of [
    [-1, -1, 0],
    [1, -1, 0],
    [1, 1, 0],
    [-1, 1, 0],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ])
    vertex(`${sx}${sy}${sz}`, [sx * W, sy * D, sz * T])
  for (const z of [0, T]) {
    vertex(`h+${z}`, [HOLE.x + HOLE.r, HOLE.y, z])
    vertex(`h-${z}`, [HOLE.x - HOLE.r, HOLE.y, z])
  }

  // Straight edges, stored once per vertex pair; `use(a, b)` orients one along a -> b.
  const lineEdges = new Map()
  const use = (a, b) => {
    const key = [a, b].sort().join("|")
    let edge = lineEdges.get(key)
    if (!edge) {
      const [pa, pb] = [v[a].p, v[b].p]
      const d = pb.map((x, i) => x - pa[i])
      const len = Math.hypot(...d)
      const vec = add(`VECTOR('',${dir(d.map((x) => x / len))},${num(len)})`)
      const line = add(`LINE('',${point(pa)},${vec})`)
      edge = { from: a, ref: add(`EDGE_CURVE('',${v[a].ref},${v[b].ref},${line},.T.)`) }
      lineEdges.set(key, edge)
    }
    return add(`ORIENTED_EDGE('',*,*,${edge.ref},${edge.from === a ? ".T." : ".F."})`)
  }
  // Half circles, counter-clockwise about +z (the circle's own sense): from -> to.
  const arc = (z, from, to) => {
    const circle = add(
      `CIRCLE('',${place([HOLE.x, HOLE.y, z], [0, 0, 1], [1, 0, 0])},${num(HOLE.r)})`
    )
    return add(`EDGE_CURVE('',${v[from].ref},${v[to].ref},${circle},.T.)`)
  }
  const oriented = (edge, sense) => add(`ORIENTED_EDGE('',*,*,${edge},${sense ? ".T." : ".F."})`)
  const arcs = {
    top1: arc(T, `h+${T}`, `h-${T}`), // through +y
    top2: arc(T, `h-${T}`, `h+${T}`), // through -y
    bot1: arc(0, "h+0", "h-0"),
    bot2: arc(0, "h-0", "h+0"),
  }

  const loop = (edges) => add(`EDGE_LOOP('',(${edges.join(",")}))`)
  const ring = (names) => loop(names.map((n, i) => use(n, names[(i + 1) % names.length])))
  const plane = (origin, normal, ref) => add(`PLANE('',${place(origin, normal, ref)})`)
  const face = (bounds, surface, sense = true) =>
    add(`ADVANCED_FACE('',(${bounds.join(",")}),${surface},${sense ? ".T." : ".F."})`)
  const outer = (l) => add(`FACE_OUTER_BOUND('',${l},.T.)`)
  const inner = (l) => add(`FACE_BOUND('',${l},.T.)`)

  // Outer loops counter-clockwise seen from outside; the hole loops clockwise.
  const faces = [
    face(
      [
        outer(ring(["-1-11", "1-11", "111", "-111"])),
        inner(loop([oriented(arcs.top2, false), oriented(arcs.top1, false)])),
      ],
      plane([0, 0, T], [0, 0, 1], [1, 0, 0])
    ),
    face(
      [
        outer(ring(["-1-10", "-110", "110", "1-10"])),
        inner(loop([oriented(arcs.bot1, true), oriented(arcs.bot2, true)])),
      ],
      plane([0, 0, 0], [0, 0, -1], [1, 0, 0])
    ),
    face(
      [outer(ring(["-1-10", "1-10", "1-11", "-1-11"]))],
      plane([0, -D, 0], [0, -1, 0], [1, 0, 0])
    ),
    face([outer(ring(["110", "-110", "-111", "111"]))], plane([0, D, 0], [0, 1, 0], [1, 0, 0])),
    face(
      [outer(ring(["-110", "-1-10", "-1-11", "-111"]))],
      plane([-W, 0, 0], [-1, 0, 0], [0, 1, 0])
    ),
    face([outer(ring(["1-10", "110", "111", "1-11"]))], plane([W, 0, 0], [1, 0, 0], [0, 1, 0])),
  ]
  // The bore: two half cylinders whose faces point at the axis (against the surface normal).
  const bore = add(
    `CYLINDRICAL_SURFACE('',${place([HOLE.x, HOLE.y, 0], [0, 0, 1], [1, 0, 0])},${num(HOLE.r)})`
  )
  faces.push(
    face(
      [
        outer(
          loop([
            use(`h+0`, `h+${T}`),
            oriented(arcs.top1, true),
            use(`h-${T}`, "h-0"),
            oriented(arcs.bot1, false),
          ])
        ),
      ],
      bore,
      false
    ),
    face(
      [
        outer(
          loop([
            use("h-0", `h-${T}`),
            oriented(arcs.top2, true),
            use(`h+${T}`, "h+0"),
            oriented(arcs.bot2, false),
          ])
        ),
      ],
      bore,
      false
    )
  )

  const shell = add(`CLOSED_SHELL('',(${faces.join(",")}))`)
  const solid = add(`MANIFOLD_SOLID_BREP('Plate',${shell})`)
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
  const shapeRep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('Plate',(${origin},${solid}),${ctx})`)
  const appCtx = add("APPLICATION_CONTEXT('automotive design')")
  add(
    `APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${appCtx})`
  )
  const prodCtx = add(`PRODUCT_CONTEXT('',${appCtx},'mechanical')`)
  const product = add(`PRODUCT('Plate','Plate','',(${prodCtx}))`)
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
FILE_DESCRIPTION(('StudioVD test fixture: plate with a hole'),'2;1');
FILE_NAME('${fileName}','2026-10-23T00:00:00',('StudioVD'),(''),'','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
${body}
ENDSEC;
END-ISO-10303-21;
`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("../../tests/fixtures/plate-hole.step", import.meta.url), plateStep())
  console.log("wrote tests/fixtures/plate-hole.step")
}
