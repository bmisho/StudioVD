import { z } from "zod"
import { LocalKeySchema } from "../primitives"
import {
  ComponentAnchorSchema,
  ComponentMateSchema,
  PlacementSchema,
  SuggestedMateSchema,
} from "./anchors"
import { ComponentIdentitySchema } from "./identity"
import { AuthoringSchema, ComponentLicenseSchema, ThumbnailSchema } from "./license"
import { ComponentPartSchema, MaterialRefSchema } from "./parts"
import { ComponentBindingSchema } from "./bindingTemplate"
import { ComponentSchematicSchema } from "./schematicBlock"
import { atMost } from "./text"

/** Entities one manifest may hold (PLAN 4.3: 1..64 parts). */
export const MANIFEST_CAPS = { parts: 64, materials: 64, anchors: 512, mates: 128 } as const

/**
 * `component.json` (PLAN 4.3): one format for downloaded, generated and user components, one
 * validator, one insertion path. Strict everywhere; cross-references checked below, including
 * those of its schematic block (Phase 11) and bindings (Phase 13). See
 * `docs/formats/component-format.md`.
 */
export const ComponentManifestSchema = z
  .object({
    format: z.literal("studiovd-component"),
    schemaVersion: z.literal(1),
    identity: ComponentIdentitySchema,
    parts: z
      .record(LocalKeySchema, ComponentPartSchema)
      .refine((p) => Object.keys(p).length >= 1, "at least one part")
      .refine(atMost(MANIFEST_CAPS.parts), `at most ${MANIFEST_CAPS.parts} parts`),
    /** The part whose frame is the component's (placement, snapping). */
    rootPart: LocalKeySchema,
    materials: z
      .record(LocalKeySchema, MaterialRefSchema)
      .refine(atMost(MANIFEST_CAPS.materials), `at most ${MANIFEST_CAPS.materials} materials`),
    anchors: z
      .record(LocalKeySchema, ComponentAnchorSchema)
      .refine(atMost(MANIFEST_CAPS.anchors), `at most ${MANIFEST_CAPS.anchors} anchors`),
    mates: z
      .record(LocalKeySchema, ComponentMateSchema)
      .refine(atMost(MANIFEST_CAPS.mates), `at most ${MANIFEST_CAPS.mates} mates`),
    suggestedMates: z.array(SuggestedMateSchema).max(64),
    placement: PlacementSchema,
    thumbnails: z.array(ThumbnailSchema).max(4),
    license: ComponentLicenseSchema,
    authoring: AuthoringSchema,
    /** Its schematic block (PLAN 11.7): a built-in model, made on insert and linked to it. */
    schematic: ComponentSchematicSchema.optional(),
    /** Bindings it brings, by its own keys (PLAN 13.2). */
    bindings: z.array(ComponentBindingSchema).max(32).optional(),
  })
  .strict()
  .superRefine((m, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message })
    const has = (record: object, key: string) => Object.hasOwn(record, key)
    if (!has(m.parts, m.rootPart)) issue(["rootPart"], "is not one of the parts")
    const generators = m.identity.requires.generators ?? {}
    for (const [key, part] of Object.entries(m.parts)) {
      if (part.material !== undefined && !has(m.materials, part.material))
        issue(["parts", key, "material"], "is not a material")
      part.materialSlots?.forEach((s, i) => {
        if (!has(m.materials, s.material))
          issue(["parts", key, "materialSlots", i, "material"], "is not a material")
      })
      const g = part.geometry
      if (g.kind === "generated" && generators[g.generator] !== g.generatorMajor)
        issue(["parts", key, "geometry"], "its generator and major must be in requires")
    }
    for (const [key, anchor] of Object.entries(m.anchors))
      if (!has(m.parts, anchor.part)) issue(["anchors", key, "part"], "is not one of the parts")
    for (const [key, mate] of Object.entries(m.mates)) {
      const [a, b] = [m.anchors[mate.anchorA], m.anchors[mate.anchorB]]
      if (!has(m.anchors, mate.anchorA) || !a) issue(["mates", key, "anchorA"], "is not an anchor")
      if (!has(m.anchors, mate.anchorB) || !b) issue(["mates", key, "anchorB"], "is not an anchor")
      if (a && b && a.part === b.part) issue(["mates", key], "both anchors are on one part")
    }
    m.suggestedMates.forEach((s, i) => {
      if (!has(m.anchors, s.anchor)) issue(["suggestedMates", i, "anchor"], "is not an anchor")
    })
    const placement = m.placement.placementAnchor
    if (placement !== undefined && !has(m.anchors, placement))
      issue(["placement", "placementAnchor"], "is not an anchor")
    if (new Set(m.thumbnails.map((t) => t.path)).size !== m.thumbnails.length)
      issue(["thumbnails"], "paths must be unique")
    checkTemplates(m, issue)
  })
export type ComponentManifest = z.infer<typeof ComponentManifestSchema>

/** A manifest's bindings name its own parts, anchors, mates and block (PLAN 13.2). */
function checkTemplates(
  m: Pick<ComponentManifest, "parts" | "anchors" | "mates" | "schematic" | "bindings">,
  issue: (path: (string | number)[], message: string) => void
) {
  const keys = new Set<string>()
  ;(m.bindings ?? []).forEach((b, i) => {
    if (keys.has(b.key)) issue(["bindings", i, "key"], "is used twice")
    keys.add(b.key)
    const refs: [string, object, string][] = []
    for (const end of ["from", "to"] as const) {
      const o: Record<string, unknown> = b[end]
      for (const [field, record] of [
        ["mate", m.mates],
        ["part", m.parts],
        ["anchor", m.anchors],
      ] as const)
        if (typeof o[field] === "string") refs.push([`${end}.${field}`, record, o[field]])
    }
    if (b.from.kind === "contact" || b.from.kind === "contactSlot")
      refs.push(["from.a", m.parts, b.from.a])
    if (b.from.kind === "contact") refs.push(["from.b", m.parts, b.from.b])
    if (b.from.kind === "distance")
      refs.push(["from.a", m.anchors, b.from.a], ["from.b", m.anchors, b.from.b])
    for (const [path, record, key] of refs)
      if (!Object.hasOwn(record, key))
        issue(["bindings", i, ...path.split(".")], "is not one of its own")
    const block = b.from.kind === "output" || b.to.kind === "param" || b.to.kind === "input"
    if (block && !m.schematic) issue(["bindings", i], "names a block the component does not have")
  })
}
