import { copyFrame } from "@/core/library/instantiate"
import { compose, fromPose, invert, toPose } from "@/core/math/rigid"
import {
  ComponentManifestSchema,
  LocalKeySchema,
  type ComponentAnchor,
  type ComponentManifest,
  type ComponentMate,
  type ComponentPart,
  type MateId,
  type SceneDocument,
} from "@/core/schema"
import { localKey, plain } from "./keys"
import { componentLicence, inheritedLicences, type UserLicence } from "./licence"
import { manifestMaterials } from "./materials"
import type { UserComponentPlan } from "./plan"

/** What the Save as component dialog asks (PLAN 9.7). */
export interface UserComponentForm {
  name: string
  slug: string
  version: string
  category: string
  tags: string[]
  /** "" for none (the component is then `U1`, `U2`...). */
  designatorPrefix: string
  summary: string
  licence: UserLicence
  author: string
}

export interface UserComponentContext {
  /** This installation's publisher namespace (`u-…`). */
  namespace: string
  appVersion: string
  /** ISO UTC. */
  createdAt: string
  /** Each asset's GLB size in bytes, as Rust reads it from the workspace. */
  glbBytes: ReadonlyMap<string, number>
}

const TYPE_NAMES = { fixed: "Fixed", revolute: "Revolute", prismatic: "Slider", spherical: "Ball" }

/** Keys entities already had as part of a component, when they are still free and valid. */
function keyed<T>(items: readonly T[], keyOf: (t: T) => string | undefined, taken: Set<string>) {
  const keys = new Map<T, string>()
  for (const item of items) {
    const key = keyOf(item)
    if (key && !taken.has(key) && LocalKeySchema.safeParse(key).success) {
      keys.set(item, key)
      taken.add(key)
    }
  }
  return keys
}

/**
 * The component.json for a plan (PLAN 9.7): parts in the root part's frame with their GLBs by
 * content address, every anchor, the internal mates, materials, the user's licence joined
 * with what the parts inherit. Keys an instance gave its entities are kept, so re-saving a
 * component keeps its mates' keys. The result passes the same validator a download does.
 */
export function buildUserComponent(
  doc: SceneDocument,
  plan: UserComponentPlan,
  form: UserComponentForm,
  ctx: UserComponentContext
): { manifest: ComponentManifest } | { error: string } {
  const frame = invert(fromPose(plan.root.pose))
  const materials = manifestMaterials(doc, plan.parts)
  const partTaken = new Set<string>()
  const partKeys = keyed(plan.parts, (p) => p.componentRef?.key, partTaken)
  for (const p of plan.parts)
    if (!partKeys.has(p)) partKeys.set(p, localKey(p.name, partTaken, "part"))
  const keyOfPart = new Map(plan.parts.map((p) => [p.id as string, partKeys.get(p) ?? ""]))

  const parts: Record<string, ComponentPart> = {}
  for (const p of plan.parts) {
    const asset = Object.hasOwn(doc.assets, p.assetId) ? doc.assets[p.assetId] : undefined
    const bytes = asset && ctx.glbBytes.get(asset.id)
    if (!asset || bytes === undefined) return { error: `${p.name} has no geometry to save.` }
    const material = p.materialId ? materials.keyOf.get(p.materialId) : undefined
    const slots = (p.materialSlots ?? []).flatMap((s) => {
      const key = materials.keyOf.get(s.materialId)
      return key ? [{ slot: s.slot, material: key }] : []
    })
    parts[keyOfPart.get(p.id) ?? ""] = {
      name: plain(p.name, 80) || "Part",
      geometry: {
        kind: "asset",
        sha256: asset.id,
        path: asset.path,
        bytes,
        triangles: asset.triangleCount,
        bboxMm: { min: [...asset.bboxMm.min], max: [...asset.bboxMm.max] },
        ...(asset.watertight !== undefined && { watertight: asset.watertight }),
        ...(asset.volumeMm3 !== undefined && { volumeMm3: asset.volumeMm3 }),
        ...(asset.centroidMm && { centroidMm: [...asset.centroidMm] }),
        ...(asset.slots && { slots: [...asset.slots] }),
      },
      transform: toPose(compose(frame, fromPose(p.pose))),
      ...(material && { material }),
      ...(slots.length > 0 && { materialSlots: slots }),
      ...(p.massOverrideKg !== undefined && {
        mass: {
          kg: p.massOverrideKg,
          ...(p.comOverrideMm && { comMm: [...p.comOverrideMm] }),
          source: { kind: "user", confidence: "medium", note: "Set by the author in StudioVD" },
        },
      }),
      collider: p.collider,
    }
  }

  const anchorTaken = new Set<string>()
  const anchorKeys = keyed(
    plan.anchors,
    (a) => (a.source.kind === "component" ? a.source.key : undefined),
    anchorTaken
  )
  const anchors: Record<string, ComponentAnchor> = {}
  const keyOfAnchor = new Map<string, string>()
  for (const a of plan.anchors) {
    const key = anchorKeys.get(a) ?? localKey(a.name ?? "", anchorTaken, "anchor")
    keyOfAnchor.set(a.id, key)
    anchors[key] = {
      part: keyOfPart.get(a.partId) ?? "",
      name: plain(a.name ?? "", 80) || "Anchor",
      kind: a.kind,
      frame: copyFrame(a.frame),
      ...(a.interface && { interface: a.interface }),
    }
  }

  const instanceKeys = new Map<MateId, string>()
  for (const c of Object.values(doc.components))
    for (const [key, id] of Object.entries(c.mates)) instanceKeys.set(id, key)
  const mateTaken = new Set<string>()
  const mateKeys = keyed(plan.mates, (m) => instanceKeys.get(m.id), mateTaken)
  const mates: Record<string, ComponentMate> = {}
  plan.mates.forEach((m, i) => {
    const key = mateKeys.get(m) ?? localKey(m.type, mateTaken, "mate")
    mates[key] = {
      name: `${TYPE_NAMES[m.type]} ${i + 1}`,
      type: m.type,
      anchorA: keyOfAnchor.get(m.anchorA) ?? "",
      anchorB: keyOfAnchor.get(m.anchorB) ?? "",
      flip: m.flip,
      angleOffsetRad: m.angleOffsetRad,
      ...(m.limits && { limits: { ...m.limits } }),
      contactsEnabled: m.contactsEnabled,
    }
  })

  const author = plain(form.author, 120)
  const summary = plain(form.summary, 280)
  const year = Number(ctx.createdAt.slice(0, 4))
  const parsed = ComponentManifestSchema.safeParse({
    format: "studiovd-component",
    schemaVersion: 1,
    identity: {
      id: `${ctx.namespace}/${form.slug}`,
      version: form.version,
      name: plain(form.name, 80),
      ...(summary && { summary }),
      category: [form.category],
      tags: form.tags,
      ...(form.designatorPrefix && { designatorPrefix: form.designatorPrefix }),
      requires: { app: `>=${ctx.appVersion}` },
    },
    parts,
    rootPart: keyOfPart.get(plan.root.id),
    materials: materials.refs,
    anchors,
    mates,
    suggestedMates: [],
    placement: { groundIfFirst: plan.root.grounded },
    thumbnails: [],
    license: componentLicence(
      form.licence,
      author,
      year,
      inheritedLicences(doc, plan.parts, ctx.namespace)
    ),
    authoring: {
      kind: "user",
      appVersion: ctx.appVersion,
      createdAt: ctx.createdAt,
      ...(author && { author }),
    },
  })
  if (parsed.success) return { manifest: parsed.data }
  const issue = parsed.error.issues[0]
  return {
    error: issue ? `${issue.path.join(".")}: ${issue.message}` : "The component is not valid.",
  }
}
