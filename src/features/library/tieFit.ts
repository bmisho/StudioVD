import { bundleDiameterMm, cablesThrough } from "@/core/connectors/bundle"
import type { AnchorId, ComponentInstanceId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { editParameters, generatorOf } from "./parameterService"

/** Room round the bundle so the tie closes on it, not into it. */
const CLEARANCE = 1.05

/**
 * A zip tie, tie mount or clip that cables run through, and the bundle size that fits them
 * (0.2.2): null for a component that is not one, or that nothing runs through yet.
 */
export function tieFit(instance: ComponentInstanceId) {
  const doc = useDocumentStore.getState().doc
  const made = generatorOf(instance)
  const c = Object.hasOwn(doc.components, instance) ? doc.components[instance] : undefined
  const anchor = c && Object.hasOwn(c.anchors, "cable") ? c.anchors.cable : undefined
  const current = made?.params.bundleMm
  if (!made || !anchor || typeof current !== "number") return null
  const cables = cablesThrough(doc, anchor)
  if (cables.length === 0) return null
  // Up to the next half millimetre: a tie size, not a measurement.
  const fits = Math.ceil(bundleDiameterMm(cables) * CLEARANCE * 2) / 2
  return { cables: cables.length, current, fits, apply: () => fitTo(instance, fits) }
}

function fitTo(instance: ComponentInstanceId, bundleMm: number): Promise<string | null> {
  const made = generatorOf(instance)
  if (!made) return Promise.resolve("This component was not made by a generator.")
  return editParameters(instance, { ...made.params, bundleMm })
}

/** Fits every tie a cable runs through to the cables it now holds (the Cable tool's last step). */
export async function fitTiesOn(route: readonly AnchorId[]): Promise<void> {
  const doc = useDocumentStore.getState().doc
  for (const id of route) {
    const anchor = Object.hasOwn(doc.anchors, id) ? doc.anchors[id] : undefined
    const part = anchor && Object.hasOwn(doc.parts, anchor.partId) ? doc.parts[anchor.partId] : null
    const instance = part?.componentRef?.instance
    const fit = instance ? tieFit(instance) : null
    if (fit && Math.abs(fit.fits - fit.current) > 1e-9) await fit.apply()
  }
}
