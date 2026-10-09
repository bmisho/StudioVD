// Proposed additions to the scene.json v1 schema (PLAN.md 1.3), to land in Phase 5 so no migration is needed.
import type { Brand, ComponentId, ComponentManifest, LocalKey, SemVer, Sha256Hex } from "./component";
import type { CatalogId, IsoUtc } from "./catalog";

export type PartId = Brand<string, "PartId">;
export type AnchorId = Brand<string, "AnchorId">;
export type MateId = Brand<string, "MateId">;
export type MaterialId = Brand<string, "MaterialId">;
export type NodeId = Brand<string, "NodeId">;
export type BlockDefId = Brand<string, "BlockDefId">;
export type BindingId = Brand<string, "BindingId">;
export type GroupId = Brand<string, "GroupId">;
export type ComponentInstanceId = Brand<string, "ComponentInstanceId">; // crypto.randomUUID()
/** Natural key "<componentId>@<version>#<manifestSha256 first 12>", shared by all instances of one definition. */
export type ComponentDefKey = Brand<string, "ComponentDefKey">;

export type ComponentOrigin =
  | { kind: "official"; catalogId: CatalogId; sequence: number }   // verified against a signed index
  | { kind: "user"; namespace: string }                             // Save as component
  | { kind: "sideloaded"; verified: false }                         // unsigned .stvdpack
  | { kind: "generator" }                                           // in-app generator preset
  | { kind: "project" };                                            // harvested from another .stvd

/** Frozen copy of the manifest: the project never needs the library to open, duplicate, or credit it. */
export interface ComponentDefSnapshot {
  key: ComponentDefKey;
  id: ComponentId;
  version: SemVer;
  manifestSha256: Sha256Hex;               // hash of the original component.json bytes
  manifest: ComponentManifest;             // validated; geometry lives in geometry/<sha>.glb
  origin: ComponentOrigin;
  firstInsertedAt: IsoUtc;
  /** Present when the definition's blockDef was copied into schematic.blockDefs. */
  blockDefId?: BlockDefId;
}

export interface ComponentInstance {
  id: ComponentInstanceId;
  def: ComponentDefKey;
  designator: string;                      // "LED3"
  groupId: GroupId;                        // scene-graph group holding the parts
  parts: Record<LocalKey, PartId>;
  anchors: Record<LocalKey, AnchorId>;
  mates: Record<LocalKey, MateId>;         // internal mates only
  materials: Record<LocalKey, MaterialId>;
  nodeId?: NodeId;
  bindings: Record<LocalKey, BindingId>;
  /** Set by "Unlink from library"; the entities stay, provenance is kept for credits. */
  unlinked?: boolean;
}

// Field additions to existing v1 entities (sketch)
export interface PartComponentFields {
  componentRef?: { instance: ComponentInstanceId; key: LocalKey };
  materialSlots?: Record<string, MaterialId>;     // see open question: material slots
  comOverrideMm?: readonly [number, number, number]; // see open question: COM override
}
export type AnchorSource =
  | { kind: "face"; faceId: number }
  | { kind: "vertex" }
  | { kind: "manual" }
  | { kind: "component"; instance: ComponentInstanceId; key: LocalKey }; // frame is authoritative, no face id
export interface MaterialProvenance { builtinKey?: string; def?: ComponentDefKey; key?: LocalKey }

export interface SceneFileLibraryAdditions {
  componentDefs: Record<ComponentDefKey, ComponentDefSnapshot>;
  components: Record<ComponentInstanceId, ComponentInstance>;
  /** License texts copied into the bundle: licenses/<sha256>.txt */
  licenseTexts: Record<Sha256Hex, { path: string; spdx: string }>;
}
