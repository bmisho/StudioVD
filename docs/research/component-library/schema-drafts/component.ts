// Proposed: src/core/schema/library/component.ts (pure TS, no React/DOM/Tauri).
// Every interface maps 1:1 to a zod schema: string unions -> z.enum, `kind` unions ->
// z.discriminatedUnion, Brand<> -> z.string().regex(..).brand<..>(), all objects .strict(),
// all numbers z.number().finite(). Lengths in mm (geometry), sim values in SI, angles in rad.

export type Brand<T, B extends string> = T & { readonly __brand: B };

/** "<namespace>/<slug>", e.g. "official/led-5mm-red". /^[a-z][a-z0-9-]{1,31}\/[a-z0-9][a-z0-9._-]{0,63}$/ */
export type ComponentId = Brand<string, "ComponentId">;
/** Strict SemVer 2.0 without build metadata, e.g. "1.2.0". */
export type SemVer = Brand<string, "SemVer">;
/** npm-style range subset: ">=0.14.0 <1.0.0" | "^1.2.0". */
export type SemVerRange = Brand<string, "SemVerRange">;
/** Lowercase hex SHA-256. /^[0-9a-f]{64}$/ */
export type Sha256Hex = Brand<string, "Sha256Hex">;
/** Key unique inside ONE manifest (parts, anchors, mates, ports, params...). /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/ */
export type LocalKey = Brand<string, "LocalKey">;
/** SPDX license expression, e.g. "CC-BY-SA-4.0 WITH KiCad-libraries-exception". */
export type SpdxExpression = Brand<string, "SpdxExpression">;
/** https: only, <= 2048 chars. Opened only through the opener wrapper after confirmation. */
export type HttpsUrl = Brand<string, "HttpsUrl">;
/** Pack-relative POSIX path, no "..", no leading "/", no backslash, <= 200 chars. */
export type PackPath = Brand<string, "PackPath">;
/** Symbol from the unit registry in src/core/units.ts ("V","A","ohm","W","N","N*m","rad/s","Pa","m3/s","lm","kg","m","1",...). */
export type UnitSymbol = Brand<string, "UnitSymbol">;
/** Id of a simulation model implemented IN THE APP (src/core/sim/models), e.g. "electrical.led". */
export type SimModelId = Brand<string, "SimModelId">;
/** Id of a parametric generator implemented IN THE APP (src/core/generators), e.g. "bearing.deepGroove". */
export type GeneratorId = Brand<string, "GeneratorId">;
/** Id of a schematic symbol drawn by the app (no SVG in packs), e.g. "led", "resistor", "box". */
export type BuiltinSymbolId = Brand<string, "BuiltinSymbolId">;
/** Expression in the Phase 10 sandbox grammar (numbers, + - * / ^, comparisons, ?:, allowlisted fns). <= 2 KiB. */
export type SandboxExpr = Brand<string, "SandboxExpr">;

export type Vec3 = readonly [number, number, number];
/** Unit quaternion, three.js order [x, y, z, w]. */
export type Quat = readonly [number, number, number, number];

export type Domain =
  | "electrical"          // V / I        (conserved)
  | "mechTranslational"   // v / F        (conserved)
  | "mechRotational"      // omega / tau  (conserved)
  | "fluid"               // p / Q        (conserved)
  | "light"               // flux         (signal)
  | "data";               // value        (signal)

export type MateType = "fixed" | "revolute" | "prismatic" | "spherical";
export type ColliderKind = "hull" | "decomposed" | "box" | "trimesh" | "none";

/** Where a number came from. Every datasheet number in an official pack carries one. */
export interface ValueSource {
  kind: "datasheet" | "standard" | "measured" | "computed" | "estimated" | "user";
  ref?: HttpsUrl;              // datasheet / standard / product page
  note?: string;               // <= 280 chars, e.g. "Table 2, typ. @ 20 mA"
  confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------- top level

export interface ComponentManifest {
  format: "studiovd-component";
  schemaVersion: 1;
  identity: ComponentIdentity;
  /** >= 1 part. Multi-part components (servo body + horn, bearing rings) list several. */
  parts: Record<LocalKey, ComponentPart>;
  /** Part whose frame is the component frame used for placement and snapping. */
  rootPart: LocalKey;
  materials: Record<LocalKey, MaterialRef>;
  anchors: Record<LocalKey, ComponentAnchor>;
  /** Internal mates between this component's own anchors; created on insert. */
  mates: Record<LocalKey, ComponentMate>;
  /** Hints for mates to OTHER parts (used for snap suggestions, never auto-applied). */
  suggestedMates: SuggestedMate[];
  /** Optional: geometry-only components (brackets, fasteners) have no schematic. */
  schematic?: ComponentSchematic;
  bindings: Record<LocalKey, ComponentBinding>;
  placement: PlacementHints;
  thumbnails: Thumbnail[];               // 1..4, PNG only
  license: ComponentLicense;
  /** How this manifest was produced (pack pipeline, generator, Save-as-component). */
  authoring: AuthoringInfo;
}

export interface ComponentIdentity {
  id: ComponentId;
  version: SemVer;
  name: string;                          // <= 80 chars, plain text
  summary?: string;                      // <= 280 chars, plain text
  description?: string;                  // <= 4000 chars, plain text (never rendered as HTML)
  /** 1..4 lowercase slugs, e.g. ["electrical", "optoelectronics", "led"]. */
  category: readonly string[];
  tags: readonly string[];               // <= 32 tags, each <= 32 chars
  /** Groups catalog variants that share geometry, e.g. "led-5mm" for red/green/blue. */
  family?: string;
  /** Schematic designator prefix, /^[A-Z]{1,4}$/, e.g. "LED", "R", "M", "SW". */
  designatorPrefix?: string;
  vendor?: string;                       // optional; generic parts omit it
  mpn?: string;                          // manufacturer part number
  datasheetUrl?: HttpsUrl;
  requires: {
    app: SemVerRange;                    // e.g. ">=0.14.0"
    simModels?: Record<SimModelId, number>;   // model id -> required MAJOR version
    generators?: Record<GeneratorId, number>; // generator id -> required MAJOR version
  };
  deprecated?: { reason: string; replacedBy?: ComponentId };
}

// ---------------------------------------------------------------- geometry & parts

export type GeometryRef =
  | {
      kind: "asset";
      /** Normalized GLB (mm, Y-up, recentred to bbox centre, normals) - same rules as Phase 4.5. */
      sha256: Sha256Hex;
      path: PackPath;                    // "geometry/<sha256>.glb"
      bytes: number;
      triangles: number;                 // re-counted and compared on install
      bboxMm: { min: Vec3; max: Vec3 };  // part-local
    }
  | {
      kind: "generated";
      /** Geometry produced by in-app code; nothing executable in the pack. */
      generator: GeneratorId;
      generatorMajor: number;
      params: Record<string, number | string | boolean>; // validated by the generator's zod schema
      output: LocalKey;                  // which body of the generator output (e.g. "outerRing")
    };

export interface ComponentPart {
  name: string;                          // "Body", "Horn", "Outer ring"
  geometry: GeometryRef;
  /** Pose of the part in the component frame (rigid only; scale is never allowed). */
  transform: { positionMm: Vec3; quaternion: Quat };
  /** Default material for the whole part. */
  material: LocalKey;
  /** Optional per-glTF-material-name overrides (needs Phase 6 material slots, see open questions). */
  materialSlots?: Record<string, LocalKey>;
  /** Datasheet mass beats density x volume of simplified geometry. Maps to Part.massOverrideKg. */
  mass?: { kg: number; comMm?: Vec3; source: ValueSource };
  collider: ColliderKind;               // rings/tubes need "decomposed": a hull fills the bore
  /** Semantic role, used by default bindings and selection UX. */
  role?: "body" | "moving" | "emitter" | "actuator" | "fastener";
}

export type MaterialRef =
  | { kind: "builtin"; key: string }     // Phase 6 built-in library key, e.g. "std.steel"
  | {
      kind: "inline";
      name: string;
      appearance: {
        colorLinear: Vec3;               // 0..1
        metalness: number;               // 0..1
        roughness: number;               // 0..1
        opacity?: number;                // 0..1
        transmission?: number;           // 0..1
        ior?: number;                    // 1..2.333 (three.js MeshPhysicalMaterial range)
        emissiveLinear?: Vec3;
        emissiveIntensity?: number;
        textures?: Partial<Record<"map" | "normalMap" | "roughnessMap" | "metalnessMap",
          { sha256: Sha256Hex; path: PackPath }>>;
      };
      physical: { densityKgM3: number; source?: ValueSource };
    };

// ---------------------------------------------------------------- anchors & mates

export interface AnchorFrame {
  originMm: Vec3;                        // part-local (relative to the recentred GLB origin)
  z: Vec3;                               // unit
  x: Vec3;                               // unit, orthogonal to z
}

/** Interface tag used to match anchors for snap suggestions ("shaft d=8 fits bore d=8"). */
export interface AnchorInterface {
  type: "shaft" | "bore" | "threadExternal" | "threadInternal" | "mountFace" | "pin"
      | "socket" | "panelHole" | "panelBody" | "flange" | "spline" | "custom";
  gender: "male" | "female" | "neutral";
  diameterMm?: number;
  standard?: string;                     // "M3", "608", "NEMA17", ...
  custom?: string;                       // free tag when type = "custom"
}

export interface ComponentAnchor {
  part: LocalKey;
  name: string;
  kind: "point" | "planar" | "axial";    // same as scene Anchor.kind
  frame: AnchorFrame;
  interface?: AnchorInterface;
  /** "placement": surface-contact frame used when dropping onto a face or the ground grid. */
  role?: "placement" | "mount" | "mate" | "port" | "reference";
  /** Schematic port physically located at this anchor (e.g. LED anode lead tip). */
  port?: LocalKey;
}

export interface ComponentMate {
  name: string;
  type: MateType;
  anchorA: LocalKey;
  anchorB: LocalKey;
  flip: boolean;
  angleOffsetRad: number;
  /** rad (revolute), mm (prismatic); spherical: cone half-angle in rad as max, min = 0. */
  limits?: { min: number; max: number; source?: ValueSource };
  contactsEnabled: boolean;
}

export interface SuggestedMate {
  anchor: LocalKey;                      // on this component
  matches: { type: AnchorInterface["type"]; diameterMm?: number; toleranceMm?: number; standard?: string };
  mateType: MateType;
  flip: boolean;
  label: string;                         // "Press into a 5 mm panel hole"
}

export interface PlacementHints {
  /** Anchor whose frame is aligned to the surface under the cursor (z = -surface normal). */
  placementAnchor?: LocalKey;
  /** Grounded when dropped into an empty scene (Phase 4.7 rule) unless false. */
  groundIfFirst: boolean;
  /** Triangle budget check (CLAUDE.md 6: ~2-3 M triangles for 200 parts). */
  totalTriangles: number;
}

// ---------------------------------------------------------------- schematic

export type PortDef =
  | {
      domain: "electrical" | "mechTranslational" | "mechRotational" | "fluid";
      direction: "terminal";
      label: string;
      side: "left" | "right" | "top" | "bottom";
      order: number;
    }
  | {
      domain: "light" | "data";
      direction: "in" | "out";
      unit: UnitSymbol;
      label: string;
      side: "left" | "right" | "top" | "bottom";
      order: number;
      defaultValue?: number;             // value of an unconnected input
    };

export interface ParamDef {
  label: string;
  unit: UnitSymbol;                      // stored in SI
  displayUnit?: UnitSymbol;              // e.g. "mA", "rpm"; converted only via units.ts
  default: number;
  min?: number;
  max?: number;
  scale?: "linear" | "log";
  editable: boolean;
  /** "transient" params are kept (open for a later transient phase) but unused by the v1 solver. */
  usedBy: readonly ("steady" | "transient")[];
  source?: ValueSource;
}

export interface Rating {
  label: string;                         // "Max forward current"
  /** Quantity checked after each solve. */
  quantity:
    | { kind: "portFlow"; port: LocalKey }
    | { kind: "portEffort"; port: LocalKey; reference?: LocalKey }
    | { kind: "power" }
    | { kind: "expr"; expr: SandboxExpr };
  unit: UnitSymbol;
  min?: number;
  max?: number;
  severity: "warning" | "error";
  source?: ValueSource;
}

export type BlockBehaviour =
  | {
      /** Code shipped in the app; the pack only names it and maps ports/params. */
      kind: "model";
      model: SimModelId;
      modelMajor: number;
      portMap: Record<string, LocalKey>;  // model port name -> this block's port
      paramMap: Record<string, LocalKey>; // model param name -> this block's param
    }
  | {
      /** Sandboxed expressions (Phase 10.5 black-box behaviour). */
      kind: "expression";
      locals?: Record<LocalKey, SandboxExpr>;
      /** Branch flow into a conserved terminal, or value of a signal output. */
      equations: readonly {
        target: { kind: "flow"; port: LocalKey } | { kind: "signal"; port: LocalKey };
        expr: SandboxExpr;
      }[];
    };

export interface BlockDefinition {
  ports: Record<LocalKey, PortDef>;
  params: Record<LocalKey, ParamDef>;
  behaviour: BlockBehaviour;
  ratings: readonly Rating[];
}

export interface ComponentSchematic {
  block: BlockDefinition;
  symbol: { kind: "builtin"; id: BuiltinSymbolId } | { kind: "box"; label?: string };
  /** Parts cross-selected with the node (Phase 10.6). Default: all parts. */
  linkedParts?: readonly LocalKey[];
}

// ---------------------------------------------------------------- bindings (Phase 12)

/** A reference that cannot be inside the component (e.g. "the part that presses the switch"). */
export interface ExternalSlot { kind: "external"; prompt: string }
export interface LocalPartRef { kind: "part"; part: LocalKey }
export interface LocalAnchorRef { kind: "anchor"; anchor: LocalKey }

export type MeasurementSource =                       // 3D -> sim
  | { kind: "mateCoordinate"; mate: LocalKey }        // rad or mm
  | { kind: "gravityLoad"; mate: LocalKey }           // N*m (revolute) or N (prismatic), PLAN.md 2
  | { kind: "mass"; parts: readonly LocalKey[] }      // kg
  | { kind: "contact"; a: LocalPartRef; b: LocalPartRef | ExternalSlot } // 0/1
  | { kind: "anchorDistance"; a: LocalAnchorRef; b: LocalAnchorRef | ExternalSlot }; // m (SI)

export type MeasurementTarget =
  | { kind: "param"; param: LocalKey }
  | { kind: "signalInput"; port: LocalKey }
  | { kind: "mechanicalSource"; port: LocalKey };     // gravity load enters as a source on a mech port

export type ResultSource =                            // sim -> 3D
  | { kind: "port"; port: LocalKey; quantity: "effort" | "flow" | "signal" | "power" }
  | { kind: "rating"; index: number };                // 0 ok, 1 warning, 2 error

export type VisualTarget =
  | { kind: "emissive"; part: LocalKey; slot?: string; colorLinear: Vec3 }
  | { kind: "tint"; part: LocalKey; colorLinear: Vec3 }
  | { kind: "forceArrow"; anchor: LocalKey }
  | { kind: "label"; anchor: LocalKey; unit: UnitSymbol; digits: number };

export type BindingMap =
  | { kind: "identity" }
  | { kind: "linear"; from: readonly [number, number]; to: readonly [number, number]; clamp: boolean }
  | { kind: "threshold"; at: number; below: number; above: number }
  | { kind: "expr"; expr: SandboxExpr }; // single variable `x`

export type ComponentBinding =
  | { direction: "measurement"; label: string; source: MeasurementSource; target: MeasurementTarget; map: BindingMap; enabled: boolean }
  | { direction: "visual"; label: string; source: ResultSource; target: VisualTarget; map: BindingMap; enabled: boolean };

// ---------------------------------------------------------------- thumbnails, license, authoring

export interface Thumbnail {
  path: PackPath;                         // "thumbnail.png"
  sha256: Sha256Hex;
  widthPx: number;                        // <= 512
  heightPx: number;                       // <= 512
}

export interface LicenseGrant {
  spdx: SpdxExpression;                   // "LicenseRef-..." allowed for user/private content
  creators: readonly { name: string; url?: HttpsUrl }[];
  copyright?: string;                     // notice as supplied by the licensor
  sourceUrl?: HttpsUrl;                   // URI to the licensed material (CC BY-SA 4.0 3(a)(1)(A)(v))
  sourceRevision?: string;                // e.g. upstream git commit
  modifications?: string;                 // e.g. "STEP tessellated to GLB, recentred, Y-up" (3(a)(1)(B))
  licenseUrl?: HttpsUrl;
  /** Full text when the license requires a copy (MIT, BSD, Apache-2.0). */
  licenseText?: { path: PackPath; sha256: Sha256Hex };
  attributionRequired: boolean;
  /** false = user-imported vendor model whose terms forbid redistribution. */
  redistributable: boolean;
}

export interface ComponentLicense {
  geometry: LicenseGrant;                 // GLBs + textures
  data: LicenseGrant;                     // anchors, params, bindings, text (catalog curation)
  thumbnail?: LicenseGrant;               // defaults to `geometry`
  /** Licenses of library components this one was built from (Save as component keeps them). */
  inherited?: readonly { component: ComponentId; version: SemVer; geometry: SpdxExpression }[];
}

export type AuthoringInfo =
  | { kind: "pipeline"; tool: string; toolVersion: string; builtAt: string }
  | { kind: "generator"; generator: GeneratorId; generatorVersion: SemVer; params: Record<string, number | string | boolean> }
  | { kind: "user"; appVersion: string; createdAt: string; author?: string };
