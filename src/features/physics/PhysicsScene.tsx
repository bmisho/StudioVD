import {
  useAfterPhysicsStep,
  useBeforePhysicsStep,
  useFilterContactPair,
  useRapier,
} from "@react-three/rapier"
import { useLayoutEffect, useRef } from "react"
import type { PhysicsModel } from "@/core/physics/physicsModel"
import { partObject } from "@/features/viewport/parts/partObjects"
import { useDocumentStore } from "@/store/document/documentStore"
import { buildPhysicsScene, partPose, type PhysicsScene as Scene } from "./buildPhysicsScene"
import { useTestRunStore } from "@/store/session/testRunStore"
import { appColliderGeometry } from "./colliderGeometry"
import { ignoreInterference, scanInterference, type ContactFilter } from "./interference"
import { contactReadings } from "./contactReadings"
import { readContacts } from "./contactStep"
import { jointReadings } from "./jointReadings"
import { readJoint } from "./jointState"
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

  const filter = useRef<ContactFilter | null>(null)

  useLayoutEffect(() => {
    const built = buildPhysicsScene(rapier, world, model, appColliderGeometry)
    // Parts that overlap where the run starts keep out of each other's way (PLAN 10.3).
    const found = scanInterference(built)
    filter.current = ignoreInterference(built, found)
    useTestRunStore.getState().setInterferences(found)
    scene.current = built
    return () => {
      scene.current = null
      drag.current = null
      filter.current = null
      useTestRunStore.getState().setInterferences([])
      jointReadings.clear()
      contactReadings.clear()
      restoreDesignPoses(model)
    }
  }, [rapier, world, model])

  useFilterContactPair(
    (c1, c2, b1, b2) => filter.current?.filterContactPair(c1, c2, b1, b2) ?? null
  )

  useBeforePhysicsStep(() => {
    if (scene.current) beforePhysicsStep(scene.current, drag.current)
  })
  useAfterPhysicsStep(() => {
    // Every step: hinges are followed across whole turns, and bindings read the latest.
    for (const j of scene.current?.joints ?? []) jointReadings.write(j.model.mateId, readJoint(j))
    jointReadings.publish()
    if (scene.current) readContacts(world, scene.current)
    for (const entry of scene.current?.dynamic ?? []) {
      for (const part of entry.parts) {
        const object = partObject(part.partId)
        if (!object) continue
        const { positionMm, quaternion } = partPose(entry, part)
        object.position.set(...positionMm)
        object.quaternion.set(...quaternion)
      }
    }
  })
  useDragInput(scene, drag)
  return null
}

/** From the CURRENT document: when a document change ends the run, its poses win. */
function restoreDesignPoses(model: PhysicsModel): void {
  const parts = useDocumentStore.getState().doc.parts
  for (const { partId } of model.bodies.flatMap((b) => b.parts)) {
    const object = partObject(partId)
    const part = Object.hasOwn(parts, partId) ? parts[partId] : undefined
    if (!object || !part) continue
    object.position.set(...part.pose.positionMm)
    object.quaternion.set(...part.pose.quaternion)
  }
}
