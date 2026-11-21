import type { PartId } from "@/core/schema"
import { contactReadings } from "@/features/physics/contactReadings"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { sampleNow } from "./bindingSampler"

// Bindings while things move (PLAN 13.4): in test mode the parts move without the document
// changing, so what the bindings measure is sampled at up to 30 Hz and a new solve is asked
// for whenever it changed. The physics is told which part pairs to watch for contact.

const FRAME_MS = 1000 / 30

/** Starts watching; `changed` is called when the bound values differ from the last ones. */
export function watchLiveBindings(changed: () => void): () => void {
  let raf = 0
  let last = 0
  let lastKey = ""
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop)
    if (t - last < FRAME_MS) return
    last = t
    const key = JSON.stringify(sampleNow())
    if (key !== lastKey) {
      lastKey = key
      changed()
    }
  }
  const sync = () => {
    const { doc } = useDocumentStore.getState()
    const pairs = Object.values(doc.bindings).flatMap((b) =>
      b.from.kind === "contact" ? [[b.from.a, b.from.b] as [PartId, PartId]] : []
    )
    contactReadings.watch(pairs)
    const running = useSessionStore.getState().testMode && Object.keys(doc.bindings).length > 0
    if (running && raf === 0) raf = requestAnimationFrame(loop)
    if (!running && raf !== 0) {
      cancelAnimationFrame(raf)
      raf = 0
      lastKey = ""
    }
  }
  sync()
  const offDoc = useDocumentStore.subscribe((s, p) => s.doc.bindings !== p.doc.bindings && sync())
  const offSession = useSessionStore.subscribe((s, p) => s.testMode !== p.testMode && sync())
  return () => {
    offDoc()
    offSession()
    if (raf !== 0) cancelAnimationFrame(raf)
  }
}
