import type { Draft } from "immer"
import type { SceneDocument } from "@/core/schema"

/** The store's immer `set` and `get`, as the action groups (materials, anchors) see them. */
export type Set = (fn: (state: Draft<{ doc: SceneDocument }>) => void) => void
export type Get = () => { doc: SceneDocument }
