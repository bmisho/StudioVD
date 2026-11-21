// "Frame the whole schematic" (after an example is built, PLAN 13.5): a request the canvas
// hears, without the requester holding React Flow.

const listeners = new Set<() => void>()

export function requestSchematicFit(): void {
  for (const l of listeners) l()
}

export function onSchematicFit(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
