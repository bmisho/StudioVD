import { useAfterPhysicsStep, useBeforePhysicsStep, useRapier } from "@react-three/rapier"
import { useLayoutEffect, useRef } from "react"
import type { PhysicsModel } from "@/core/physics/physicsModel"
import { partObject } from "@/features/viewport/parts/partObjects"
import { useDocumentStore } from "@/store/document/documentStore"
import { buildPhysicsScene, partPose, type PhysicsScene as Scene } from "./buildPhysicsScene"
import { beforePhysicsStep, type Drag } from "./physicsStep"
import { useDragInput } from "./useDragInput"

/**
 * The bodies of one test run. Built once per mount: PhysicsLayer remounts <Physics> (a fresh
 * world) whenever the model or the run changes, so nothing here removes bodies. Live poses
 * are transient (CLAUDE.md §4 kind 3): written straight into the parts' scene objects after
 * every step, never into the store. Unmounting puts every part back at its design pose.
 */
export function PhysicsScene({ model }: { model: PhysicsModel }) {
  const { world, rapier } = useRapier()
  const scene = useRef<Scene | null>(null)
  const drag = useRef<Drag | null>(null)

  useLayoutEffect(() => {
    scene.current = buildPhysicsScene(rapier, world, model)
    return () => {
      scene.current = null
      drag.current = null
      restoreDesignPoses(model)
    }
  }, [rapier, world, model])

  useBeforePhysicsStep(() => {
    if (scene.current) beforePhysicsStep(scene.current, drag.current)
  })
  useAfterPhysicsStep(() => {
    for (const entry of scene.current?.dynamic ?? []) {
      const object = partObject(entry.partId)
      if (!object) continue
      const { positionMm, quaternion } = partPose(entry)
      object.position.set(...positionMm)
      object.quaternion.set(...quaternion)
    }
  })
  useDragInput(scene, drag)
  return null
}

/** From the CURRENT document: when a document change ends the run, its poses win. */
function restoreDesignPoses(model: PhysicsModel): void {
  const parts = useDocumentStore.getState().doc.parts
  for (const { partId } of model.bodies) {
    const object = partObject(partId)
    const part = Object.hasOwn(parts, partId) ? parts[partId] : undefined
    if (!object || !part) continue
    object.position.set(...part.pose.positionMm)
    object.quaternion.set(...part.pose.quaternion)
  }
}
