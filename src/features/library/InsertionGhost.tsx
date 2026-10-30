import { useSyncExternalStore } from "react"
import { compose, fromPose, toPose } from "@/core/math/rigid"
import { GhostAsset } from "@/features/assembly/GhostAsset"
import { insertionPreview } from "./insertionPreview"

/** The component being dragged in from the Library, where it would land (PLAN 9.5). */
export function InsertionGhost() {
  const preview = useSyncExternalStore(insertionPreview.subscribe, insertionPreview.get)
  if (!preview?.ready || !preview.pose) return null
  const frame = fromPose(preview.pose)
  const { assets, def } = preview.ready
  return Object.entries(def.manifest.parts).map(([key, part]) => {
    const asset = Object.hasOwn(assets, key) ? assets[key] : undefined
    if (!asset) return null
    const pose = toPose(compose(frame, fromPose(part.transform)))
    return <GhostAsset key={key} asset={asset} pose={pose} />
  })
}
