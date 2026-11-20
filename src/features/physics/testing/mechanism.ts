import type * as Rapier from "@dimforge/rapier3d-compat"
// Test helper (not app code): small mechanisms as real documents, stepped headless on the
// same document -> model -> Rapier path the app uses.
import { anchor as makeAnchor, mate as makeMate } from "@/core/assembly/testing/mateFixtures"
import { physicsModelFromDocument } from "@/core/physics/physicsModel"
import {
  createEmptyDocument,
  newId,
  type Anchor,
  type AssetId,
  type Coupling,
  type CouplingId,
  type Mate,
  type MateType,
  type Part,
  type PartId,
  type Quat,
  type Vec3,
} from "@/core/schema"
import { buildPhysicsScene, type RapierApi } from "../buildPhysicsScene"
import { ignoreInterference, scanInterference } from "../interference"
import { readJoint } from "../jointState"
import type { ColliderGeometry } from "../partColliders"
import { configureWorld, TIME_STEP_S } from "../physicsConfig"
import { beforePhysicsStep, beginDrag, grabPoint, type Drag } from "../physicsStep"

export interface BoxOptions {
  grounded?: boolean
  quaternion?: Quat
  collider?: Part["collider"]
}

export function mechanism() {
  const doc = createEmptyDocument("0.0.0")
  let assets = 0
  return {
    doc,
    /** A box part `2 × half` in size, centred at `positionMm` (its own asset). */
    box(name: string, half: Vec3, positionMm: Vec3, o: BoxOptions = {}): Part {
      const assetId = (++assets).toString(16).padStart(64, "0") as AssetId
      doc.assets[assetId] = {
        id: assetId,
        path: `geometry/${assetId}.glb`,
        triangleCount: 12,
        bboxMm: { min: [-half[0], -half[1], -half[2]], max: [...half] },
        watertight: true,
        volumeMm3: 8 * half[0] * half[1] * half[2],
      }
      const part: Part = {
        id: newId<PartId>(),
        name,
        assetId,
        parentId: null,
        pose: { positionMm, quaternion: o.quaternion ?? [0, 0, 0, 1] },
        materialId: null,
        grounded: o.grounded ?? false,
        visible: true,
        collider: o.collider ?? "box",
      }
      doc.parts[part.id] = part
      return part
    },
    /** An anchor at a WORLD point on `part` (unrotated parts), facing `z`. */
    anchor(part: Part, worldMm: Vec3, z: Vec3 = [0, 0, 1], x: Vec3 = [1, 0, 0]): Anchor {
      const p = part.pose.positionMm
      const a = makeAnchor(part, [worldMm[0] - p[0], worldMm[1] - p[1], worldMm[2] - p[2]], z, x)
      doc.anchors[a.id] = a
      return a
    },
    mate(a: Anchor, b: Anchor, type: MateType, extra: Partial<Mate> = {}): Mate {
      const m = makeMate(a, b, type, extra)
      doc.mates[m.id] = m
      return m
    },
    couple(a: Mate, b: Mate, kind: Coupling["kind"], ratio: number): Coupling {
      const c: Coupling = { id: newId<CouplingId>(), kind, mateA: a.id, mateB: b.id, ratio }
      doc.couplings[c.id] = c
      return c
    },
    /** The world, built now from the document. */
    sim(rapier: RapierApi & Pick<typeof Rapier, "EventQueue">, geometry?: ColliderGeometry) {
      const world = new rapier.World({ x: 0, y: 0, z: 0 })
      configureWorld(world)
      const model = physicsModelFromDocument(doc)
      const scene = buildPhysicsScene(rapier, world, model, geometry)
      const interferences = scanInterference(scene)
      const hooks = ignoreInterference(scene, interferences)
      // Rapier's JS step uses the hooks only with an event queue (as the app's <Physics>).
      const events = new rapier.EventQueue(false)
      let drag: Drag | null = null
      const jointOf = (m: Mate) => {
        const j = scene.joints.find((x) => x.model.mateId === m.id)
        if (!j) throw new Error("no such joint")
        return j
      }
      return {
        world,
        model,
        scene,
        interferences,
        grab(part: Part, worldMm: Vec3) {
          const entry = scene.bodies.get(part.id)
          if (!entry) throw new Error("no such body")
          drag = beginDrag(entry, worldMm)
        },
        moveTo(targetMm: Vec3) {
          if (drag) drag.targetMm = targetMm
        },
        release() {
          drag = null
        },
        grabPoint: () => (drag ? grabPoint(drag) : null),
        /** Steps `n` times, reading every joint each step (as the app does). */
        step(n = 1, each?: (i: number) => void) {
          for (let i = 0; i < n; i++) {
            beforePhysicsStep(scene, drag)
            world.step(events, hooks)
            for (const j of scene.joints) readJoint(j)
            each?.(i)
          }
        },
        /** The mate's coordinate now (rad or mm, from where it was snapped). */
        coordinate: (m: Mate) => readJoint(jointOf(m)),
        position(part: Part): Vec3 {
          const t = scene.bodies.get(part.id)?.body.translation()
          return t ? [t.x, t.y, t.z] : [NaN, NaN, NaN]
        },
        seconds: (s: number) => Math.round(s / TIME_STEP_S),
      }
    },
  }
}
