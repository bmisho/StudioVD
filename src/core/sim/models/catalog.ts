import type { ModelCategory, ModelDef } from "./define"
import { modelKey, MODELS } from "./registry"

// The Add block menu's view of the registry: categories in order, filtered by typed words.

export const CATEGORY_NAMES: Readonly<Record<ModelCategory, string>> = {
  electrical: "Electrical",
  electromechanical: "Motors and actuators",
  drivers: "Drivers",
  mechanical: "Mechanical",
  fluid: "Fluid",
  light: "Light",
  data: "Data and logic",
  controllers: "Controllers",
}

export interface ModelGroup {
  category: ModelCategory
  name: string
  models: { key: string; model: ModelDef }[]
}

/** Models whose name, summary or id holds every word of `query`, grouped by category. */
export function modelGroups(query: string): ModelGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const groups = new Map<ModelCategory, ModelGroup>()
  for (const model of MODELS) {
    const text = `${model.name} ${model.summary} ${model.id}`.toLowerCase()
    if (!words.every((w) => text.includes(w))) continue
    const group = groups.get(model.category) ?? {
      category: model.category,
      name: CATEGORY_NAMES[model.category],
      models: [],
    }
    group.models.push({ key: modelKey(model), model })
    groups.set(model.category, group)
  }
  const order = Object.keys(CATEGORY_NAMES)
  return [...groups.values()].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
}
