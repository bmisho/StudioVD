import type { SearchDoc } from "@/core/library/search"

/** Main thread -> search worker: the cards once (on change), then queries. */
export type LibrarySearchRequest =
  | { kind: "docs"; docs: SearchDoc[] }
  | { kind: "query"; requestId: number; query: string; source: SearchDoc["source"] | "all" }

export interface LibrarySearchReply {
  requestId: number
  keys: string[]
}
