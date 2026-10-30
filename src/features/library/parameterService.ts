import { findGenerator } from "@/core/generators/registry"
import type { ComponentInstanceId, GeneratorParams } from "@/core/schema"
import { toastNotifier as notify } from "@/lib/notify"
import { writeAsset } from "@/lib/tauri/files"
import { copyComponentIntoProject } from "@/lib/tauri/library"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { generateComponent } from "./generatorClient"
import { prepareInsertion } from "./prepareInsertion"

/** The generator that made an instance's definition, and its parameters; null otherwise. */
export function generatorOf(instance: ComponentInstanceId) {
  const doc = useDocumentStore.getState().doc
  const c = Object.hasOwn(doc.components, instance) ? doc.components[instance] : undefined
  const def =
    c?.def && Object.hasOwn(doc.componentDefs, c.def) ? doc.componentDefs[c.def] : undefined
  const authoring = def?.manifest.authoring
  if (authoring?.kind !== "generator") return null
  const major = def?.manifest.identity.requires.generators?.[authoring.generator]
  const gen = major === undefined ? undefined : findGenerator(authoring.generator, major)
  return gen ? { gen, params: authoring.params } : null
}

/**
 * Edit parameters (PLAN 9.5): regenerates the instance in the generator worker and swaps its
 * geometry in ONE undo entry, keeping keys (and so the mates other parts have to it).
 * Returns an error message, or null when it applied.
 */
export async function editParameters(
  instance: ComponentInstanceId,
  params: GeneratorParams
): Promise<string | null> {
  const made = generatorOf(instance)
  if (!made) return "This component was not made by a generator."
  if (useSessionStore.getState().testMode) return "Leave test mode to edit parameters."
  const checked = made.gen.params.safeParse(params)
  if (!checked.success) return checked.error.issues[0]?.message ?? "These parameters are not valid."
  try {
    const ready = await prepareInsertion(
      { kind: "generator", id: made.gen.id, major: made.gen.major, params: checked.data },
      { generate: generateComponent, writeAsset, copyComponentIntoProject },
      () => useDocumentStore.getState().doc.assets
    )
    useDocumentStore.getState().regenerateComponent(instance, ready.def, ready.assets)
    return null
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    notify.error("The parameters could not be applied", message)
    return message
  }
}
