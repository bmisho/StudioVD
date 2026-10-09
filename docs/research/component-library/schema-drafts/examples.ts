// Type-checked examples. Numbers that need a datasheet are `declare const` (NOT invented).
import type {
  ComponentManifest, ComponentId, SemVer, SemVerRange, LocalKey, Sha256Hex, PackPath,
  SpdxExpression, HttpsUrl, UnitSymbol, SimModelId, GeneratorId, BuiltinSymbolId, SandboxExpr,
} from "./component";

const k = (s: string) => s as LocalKey;
const sha = (s: string) => s as Sha256Hex;
const u = (s: string) => s as UnitSymbol;

// ---- Bearing: generator-backed, two parts + internal revolute. Dimensions/mass sourced (SKF 608-2RSH).
const SKF_608_2RSH = "https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-608-2RSH" as HttpsUrl;
export const bearing608: ComponentManifest = {
  format: "studiovd-component",
  schemaVersion: 1,
  identity: {
    id: "gen/bearing-608-2rsh" as ComponentId,
    version: "1.0.0" as SemVer,
    name: "Deep groove ball bearing 608-2RSH (8 x 22 x 7 mm)",
    category: ["mechanical", "bearings", "deep-groove"],
    tags: ["608", "skate bearing", "8mm"],
    designatorPrefix: "B",
    vendor: "SKF",
    mpn: "608-2RSH",
    datasheetUrl: SKF_608_2RSH,
    requires: { app: ">=0.14.0" as SemVerRange, generators: { ["bearing.deepGroove" as GeneratorId]: 1 } },
  },
  parts: {
    [k("outer")]: {
      name: "Outer ring",
      geometry: { kind: "generated", generator: "bearing.deepGroove" as GeneratorId, generatorMajor: 1,
        params: { dMm: 8, DMm: 22, BMm: 7, seals: "2RS" }, output: k("outerRing") },
      transform: { positionMm: [0, 0, 0], quaternion: [0, 0, 0, 1] },
      material: k("steel"),
      mass: { kg: 0.0119, source: { kind: "datasheet", ref: SKF_608_2RSH, note: "whole bearing; split between rings is unknown", confidence: "medium" } },
      collider: "decomposed",
      role: "body",
    },
    [k("inner")]: {
      name: "Inner ring",
      geometry: { kind: "generated", generator: "bearing.deepGroove" as GeneratorId, generatorMajor: 1,
        params: { dMm: 8, DMm: 22, BMm: 7, seals: "2RS" }, output: k("innerRing") },
      transform: { positionMm: [0, 0, 0], quaternion: [0, 0, 0, 1] },
      material: k("steel"),
      collider: "decomposed",
      role: "moving",
    },
  },
  rootPart: k("outer"),
  materials: { [k("steel")]: { kind: "builtin", key: "std.steel" } },
  anchors: {
    [k("od")]: { part: k("outer"), name: "Outer Ø22", kind: "axial",
      frame: { originMm: [0, 0, 0], z: [0, 1, 0], x: [1, 0, 0] },
      interface: { type: "shaft", gender: "male", diameterMm: 22 }, role: "mount" },
    [k("outerAxis")]: { part: k("outer"), name: "Outer axis", kind: "axial",
      frame: { originMm: [0, 0, 0], z: [0, 1, 0], x: [1, 0, 0] }, role: "mate" },
    [k("bore")]: { part: k("inner"), name: "Bore Ø8", kind: "axial",
      frame: { originMm: [0, 0, 0], z: [0, 1, 0], x: [1, 0, 0] },
      interface: { type: "bore", gender: "female", diameterMm: 8 }, role: "mount" },
  },
  mates: {
    [k("spin")]: { name: "Rotation", type: "revolute", anchorA: k("outerAxis"), anchorB: k("bore"),
      flip: false, angleOffsetRad: 0, contactsEnabled: false },
  },
  suggestedMates: [
    { anchor: k("bore"), matches: { type: "shaft", diameterMm: 8, toleranceMm: 0.05 }, mateType: "fixed", flip: false, label: "Press onto an 8 mm shaft" },
    { anchor: k("od"), matches: { type: "bore", diameterMm: 22, toleranceMm: 0.05 }, mateType: "fixed", flip: false, label: "Press into a 22 mm housing bore" },
  ],
  bindings: {},
  placement: { groundIfFirst: true, totalTriangles: 0 /* filled by generator output */ },
  thumbnails: [{ path: "thumbnail.png" as PackPath, sha256: sha("0".repeat(64)), widthPx: 256, heightPx: 256 }],
  license: {
    geometry: { spdx: "CC0-1.0" as SpdxExpression, creators: [{ name: "StudioVD contributors" }], attributionRequired: false, redistributable: true },
    data: { spdx: "CC0-1.0" as SpdxExpression, creators: [{ name: "StudioVD contributors" }], sourceUrl: SKF_608_2RSH, attributionRequired: false, redistributable: true },
  },
  authoring: { kind: "generator", generator: "bearing.deepGroove" as GeneratorId, generatorVersion: "1.0.0" as SemVer,
    params: { dMm: 8, DMm: 22, BMm: 7, seals: "2RS" } },
};

// ---- Potentiometer: two parts, revolute with limits, binding angle -> wiper position.
declare const POT_ROTATION_RAD: number;      // from the chosen datasheet (unknown here)
declare const POT_R_OHM: number;             // nominal track resistance
declare const POT_MAX_POWER_W: number;
declare const GLB_BODY: Sha256Hex, GLB_SHAFT: Sha256Hex, PNG: Sha256Hex;
export const pot: ComponentManifest = {
  format: "studiovd-component",
  schemaVersion: 1,
  identity: {
    id: "official/pot-9mm-vertical" as ComponentId, version: "1.0.0" as SemVer,
    name: "Rotary potentiometer, 9 mm, vertical", category: ["electrical", "passive", "potentiometer"],
    tags: ["pot", "trimmer", "knob"], designatorPrefix: "RV",
    requires: { app: ">=0.14.0" as SemVerRange, simModels: { ["electrical.potentiometer" as SimModelId]: 1 } },
  },
  parts: {
    [k("body")]: { name: "Body", geometry: { kind: "asset", sha256: GLB_BODY, path: `geometry/${GLB_BODY}.glb` as PackPath, bytes: 0, triangles: 0, bboxMm: { min: [0, 0, 0], max: [0, 0, 0] } },
      transform: { positionMm: [0, 0, 0], quaternion: [0, 0, 0, 1] }, material: k("abs"), collider: "hull", role: "body" },
    [k("shaft")]: { name: "Shaft", geometry: { kind: "asset", sha256: GLB_SHAFT, path: `geometry/${GLB_SHAFT}.glb` as PackPath, bytes: 0, triangles: 0, bboxMm: { min: [0, 0, 0], max: [0, 0, 0] } },
      transform: { positionMm: [0, 0, 0], quaternion: [0, 0, 0, 1] }, material: k("steel"), collider: "hull", role: "moving" },
  },
  rootPart: k("body"),
  materials: { [k("abs")]: { kind: "builtin", key: "std.abs" }, [k("steel")]: { kind: "builtin", key: "std.steel" } },
  anchors: {
    [k("bushing")]: { part: k("body"), name: "Bushing axis", kind: "axial", frame: { originMm: [0, 0, 0], z: [0, 1, 0], x: [1, 0, 0] }, role: "mate" },
    [k("shaftAxis")]: { part: k("shaft"), name: "Shaft axis", kind: "axial", frame: { originMm: [0, 0, 0], z: [0, 1, 0], x: [1, 0, 0] }, interface: { type: "shaft", gender: "male" }, role: "mount" },
    [k("pins")]: { part: k("body"), name: "PCB seating plane", kind: "planar", frame: { originMm: [0, 0, 0], z: [0, -1, 0], x: [1, 0, 0] }, role: "placement" },
  },
  mates: {
    [k("rot")]: { name: "Wiper rotation", type: "revolute", anchorA: k("bushing"), anchorB: k("shaftAxis"), flip: false, angleOffsetRad: 0,
      limits: { min: 0, max: POT_ROTATION_RAD }, contactsEnabled: false },
  },
  suggestedMates: [],
  schematic: {
    symbol: { kind: "builtin", id: "potentiometer" as BuiltinSymbolId },
    block: {
      ports: {
        [k("a")]: { domain: "electrical", direction: "terminal", label: "1", side: "left", order: 0 },
        [k("w")]: { domain: "electrical", direction: "terminal", label: "W", side: "bottom", order: 0 },
        [k("b")]: { domain: "electrical", direction: "terminal", label: "3", side: "right", order: 0 },
      },
      params: {
        [k("R")]: { label: "Track resistance", unit: u("ohm"), default: POT_R_OHM, min: 0, editable: true, usedBy: ["steady"] },
        [k("pos")]: { label: "Wiper position", unit: u("1"), default: 0.5, min: 0, max: 1, editable: false, usedBy: ["steady"] },
      },
      behaviour: { kind: "model", model: "electrical.potentiometer" as SimModelId, modelMajor: 1,
        portMap: { a: k("a"), w: k("w"), b: k("b") }, paramMap: { R: k("R"), position: k("pos") } },
      ratings: [{ label: "Power", quantity: { kind: "power" }, unit: u("W"), max: POT_MAX_POWER_W, severity: "warning" }],
    },
  },
  bindings: {
    [k("angleToWiper")]: { direction: "measurement", label: "Shaft angle -> wiper", enabled: true,
      source: { kind: "mateCoordinate", mate: k("rot") }, target: { kind: "param", param: k("pos") },
      map: { kind: "linear", from: [0, POT_ROTATION_RAD], to: [0, 1], clamp: true } },
  },
  placement: { placementAnchor: k("pins"), groundIfFirst: true, totalTriangles: 0 },
  thumbnails: [{ path: "thumbnail.png" as PackPath, sha256: PNG, widthPx: 256, heightPx: 256 }],
  license: {
    geometry: { spdx: "CC-BY-SA-4.0 WITH KiCad-libraries-exception" as SpdxExpression, creators: [{ name: "KiCad Libraries contributors" }],
      sourceUrl: "https://gitlab.com/kicad/libraries/kicad-packages3D" as HttpsUrl, sourceRevision: "<commit>",
      modifications: "Split into body and shaft; STEP tessellated to GLB; mm, Y-up, recentred",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/legalcode" as HttpsUrl, attributionRequired: true, redistributable: true },
    data: { spdx: "CC0-1.0" as SpdxExpression, creators: [{ name: "StudioVD contributors" }], attributionRequired: false, redistributable: true },
  },
  authoring: { kind: "pipeline", tool: "studiovd-pack-builder", toolVersion: "1.0.0", builtAt: "2026-10-09T00:00:00Z" },
};

// ---- LED expression variant (black-box), light output -> emissive.
export const ledEquations = {
  kind: "expression",
  locals: { [k("vd")]: "V(a) - V(k)" as SandboxExpr },
  equations: [
    { target: { kind: "flow", port: k("a") }, expr: "vd > Vf ? (vd - Vf) / Rs : 0" as SandboxExpr },
    { target: { kind: "signal", port: k("light") }, expr: "eta * max(vd - Vf, 0) / Rs" as SandboxExpr },
  ],
} as const;
