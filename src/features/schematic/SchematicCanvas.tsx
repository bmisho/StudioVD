import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react"
import { useCallback, useEffect, useRef, type MouseEvent } from "react"
import { blockLayout, GRID } from "@/core/schematic/layout"
import { freeSpot } from "@/core/schematic/placement"
import type { NodeId, Port } from "@/core/schema"
import { findModel } from "@/core/sim/models/registry"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { BlockNode } from "./BlockNode"
import { ConnectionHint } from "./ConnectionHint"
import { onBlockRequest } from "./blockRequest"
import { onSchematicFit } from "./fitRequest"
import type { BlockFlowNode, WireFlowEdge } from "./flowTypes"
import { SchematicToolbar } from "./SchematicToolbar"
import { useConnecting } from "./useConnecting"
import { useFlowElements } from "./useFlowElements"
import { useSchematicChanges } from "./useSchematicChanges"
import { WireEdge } from "./WireEdge"

const NODE_TYPES = { block: BlockNode }
const EDGE_TYPES = { wire: WireEdge }
const SNAP: [number, number] = [GRID, GRID]

/** The webview never leaves the app (CLAUDE.md §6): the attribution link does not navigate. */
function keepOffline(e: MouseEvent) {
  if (e.target instanceof Element && e.target.closest(".react-flow__attribution a"))
    e.preventDefault()
}

/** The schematic canvas (PLAN 11.1): the document's blocks and wires, edited in place. */
export function SchematicCanvas() {
  const changes = useSchematicChanges()
  const { nodes, edges } = useFlowElements(changes.measured)
  const { isValidConnection, onConnect } = useConnecting()
  const flow = useReactFlow<BlockFlowNode, WireFlowEdge>()
  const wrapper = useRef<HTMLDivElement>(null)

  /** Where a new block with these ports goes: the middle of the view, clear of others. */
  const spotFor = useCallback(
    (ports: Port[]) => {
      const r = wrapper.current?.getBoundingClientRect()
      const middle = flow.screenToFlowPosition({
        x: (r?.left ?? 0) + (r?.width ?? 0) / 2,
        y: (r?.top ?? 0) + (r?.height ?? 0) / 2,
      })
      return freeSpot(useDocumentStore.getState().doc, blockLayout({ ports }), middle)
    },
    [flow]
  )

  // A project opened or an example built: show all of its schematic.
  const project = useDocumentStore((s) => s.doc.project)
  useEffect(() => {
    const fit = () => requestAnimationFrame(() => void flow.fitView({ padding: 0.15, maxZoom: 1 }))
    fit()
    return onSchematicFit(fit)
  }, [flow, project])

  const placed = useCallback((id: NodeId | null) => {
    if (id) useSessionStore.getState().select([{ kind: "node", id }])
  }, [])
  const addBlock = useCallback(
    (key: string) => {
      const ports = findModel(key)?.ports ?? []
      placed(useDocumentStore.getState().addBlock(key, spotFor(ports)))
    },
    [placed, spotFor]
  )
  useEffect(() => onBlockRequest(addBlock), [addBlock])

  return (
    <div
      ref={wrapper}
      className="studiovd-schematic h-full w-full"
      data-testid="schematic-editor"
      onPointerDownCapture={changes.onPointerDownCapture}
      onClickCapture={keepOffline}
    >
      <ReactFlow<BlockFlowNode, WireFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={changes.onNodesChange}
        onEdgesChange={changes.onEdgesChange}
        onNodeDragStart={changes.onDragStart}
        onNodeDragStop={changes.onDragStop}
        onSelectionDragStart={changes.onDragStart}
        onSelectionDragStop={changes.onDragStop}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Loose}
        snapToGrid
        snapGrid={SNAP}
        // Delete goes through the command registry (Edit › Delete), never React Flow's own.
        deleteKeyCode={null}
        multiSelectionKeyCode={["Control", "Meta"]}
        minZoom={0.1}
        maxZoom={4}
        colorMode="light"
        // React Flow asks for its attribution unless subscribed: it stays, as inert text.
        attributionPosition="top-right"
        aria-label="Schematic canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} color="var(--input)" />
        <MiniMap
          style={{ width: 160, height: 100 }}
          pannable
          zoomable
          ariaLabel="Schematic overview"
          nodeColor="var(--input)"
          nodeStrokeColor="var(--muted-foreground)"
        />
        <Controls showInteractive={false} aria-label="Zoom controls" />
        <Panel position="top-left">
          <SchematicToolbar
            onAddBlock={addBlock}
            onAddBlackBox={() =>
              placed(useDocumentStore.getState().createBlackBox("Black box", spotFor([])))
            }
          />
        </Panel>
        <ConnectionHint />
      </ReactFlow>
    </div>
  )
}
