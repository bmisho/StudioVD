import { useEffect, useMemo, useState } from "react"
import type { LibraryItem } from "@/core/library/items"
import { search, searchDoc, type SearchDoc } from "@/core/library/search"
import type { LibrarySearchReply, LibrarySearchRequest } from "@/workers/librarySearchProtocol"

let worker: Worker | null = null
let nextId = 1
const listeners = new Map<number, (keys: string[]) => void>()

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null // jsdom: search on this thread
  if (worker) return worker
  worker = new Worker(new URL("../../workers/librarySearch.worker.ts", import.meta.url), {
    type: "module",
    name: "library-search",
  })
  worker.onmessage = (event: MessageEvent<LibrarySearchReply>) => {
    listeners.get(event.data.requestId)?.(event.data.keys)
    listeners.delete(event.data.requestId)
  }
  return worker
}

/**
 * The keys of the cards matching `query` in `source`, best first (PLAN 9.4), searched in a
 * worker; until its first answer for new cards, the unfiltered list.
 */
export function useLibrarySearch(
  items: readonly LibraryItem[],
  query: string,
  source: SearchDoc["source"] | "all"
): string[] {
  const docs = useMemo(() => items.map(searchDoc), [items])
  // Without workers (jsdom), the search runs on this thread.
  const direct = useMemo(
    () => (typeof Worker === "undefined" ? search(docs, query, source) : null),
    [docs, query, source]
  )
  const [result, setResult] = useState<{ docs: SearchDoc[]; keys: string[] } | null>(null)
  useEffect(() => {
    getWorker()?.postMessage({ kind: "docs", docs } satisfies LibrarySearchRequest)
  }, [docs])
  useEffect(() => {
    const w = getWorker()
    if (!w) return
    const requestId = nextId++
    let live = true
    listeners.set(requestId, (keys) => {
      if (live) setResult({ docs, keys })
    })
    w.postMessage({ kind: "query", requestId, query, source } satisfies LibrarySearchRequest)
    return () => {
      live = false
      listeners.delete(requestId)
    }
  }, [docs, query, source])
  if (direct) return direct
  if (result?.docs === docs) return result.keys
  return docs.filter((d) => source === "all" || d.source === source).map((d) => d.key)
}
