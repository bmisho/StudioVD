import { readManifest, type ComponentManifest, type SceneDocument } from "@/core/schema"
import type { InstalledRecord } from "../items"
import { buildUserComponent, type UserComponentForm } from "./build"
import { slugFor } from "./keys"
import { inheritedLicences } from "./licence"
import type { UserComponentPlan } from "./plan"
import { suggestVersion } from "./version"

export interface SaveDefaults {
  form: UserComponentForm
  /** Versions of the default slug already in the library. */
  taken: string[]
  /** Who or what the parts inherit licences from. */
  inherited: string[]
}

/** The versions of `id` in the library, and the newest one's manifest. */
export function savedVersions(
  installed: readonly InstalledRecord[],
  id: string,
  appVersion: string
): { versions: string[]; latest: ComponentManifest | undefined } {
  const mine = installed.filter((r) => r.id === id)
  const last = mine.at(-1)
  const read = last && readManifest(new TextEncoder().encode(last.manifest), appVersion, false)
  return { versions: mine.map((r) => r.version), latest: read?.ok ? read.manifest : undefined }
}

/**
 * What the Save as component dialog starts with (PLAN 9.7): the name of the component the
 * parts came from (or the root part's), its category, tags and prefix; a version after the
 * newest one saved under that slug, bumped by how the keys the builder will write differ.
 */
export function saveDefaults(
  doc: SceneDocument,
  plan: UserComponentPlan,
  namespace: string,
  installed: readonly InstalledRecord[],
  appVersion: string
): SaveDefaults {
  const ref = plan.root.componentRef
  const instance =
    ref && Object.hasOwn(doc.components, ref.instance) ? doc.components[ref.instance] : undefined
  const def =
    instance?.def && Object.hasOwn(doc.componentDefs, instance.def)
      ? doc.componentDefs[instance.def]
      : undefined
  const identity = def?.manifest.identity
  const name = (identity?.name ?? plan.root.name).slice(0, 80).trim() || "Component"
  const form: UserComponentForm = {
    name,
    slug: slugFor(name),
    version: "1.0.0",
    category: identity?.category[0] ?? "other",
    tags: identity?.tags ?? [],
    designatorPrefix: identity?.designatorPrefix ?? "",
    summary: "",
    licence: "private",
    author: "",
  }
  const { versions, latest } = savedVersions(installed, `${namespace}/${form.slug}`, appVersion)
  const draft = buildUserComponent(doc, plan, form, {
    namespace,
    appVersion,
    createdAt: "2000-01-01T00:00:00Z",
    glbBytes: new Map(plan.parts.map((p) => [p.assetId, 1])),
  })
  if ("manifest" in draft) form.version = suggestVersion(versions, latest, draft.manifest)
  const inherited = inheritedLicences(doc, plan.parts).map(
    (i) => i.component ?? i.grant.creators[0]?.name ?? i.grant.spdx
  )
  return { form, taken: versions, inherited: [...new Set(inherited)] }
}
