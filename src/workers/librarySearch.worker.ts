/// <reference lib="webworker" />
import { search, type SearchDoc } from "@/core/library/search"
import type { LibrarySearchReply, LibrarySearchRequest } from "./librarySearchProtocol"

// Library search (PLAN 9.4): the catalogue of Phase 14 lists thousands of cards; scoring
// them per keystroke stays off the main thread.

const scope = self as unknown as DedicatedWorkerGlobalScope
let docs: SearchDoc[] = []

scope.onmessage = (event: MessageEvent<LibrarySearchRequest>) => {
  const message = event.data
  if (message.kind === "docs") {
    docs = message.docs
    return
  }
  const reply: LibrarySearchReply = {
    requestId: message.requestId,
    keys: search(docs, message.query, message.source),
  }
  scope.postMessage(reply)
}
