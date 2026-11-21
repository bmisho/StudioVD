import "@xyflow/react/dist/style.css"
import { ReactFlowProvider } from "@xyflow/react"
import { SchematicCanvas } from "./SchematicCanvas"

/** The schematic pane (Phase 11). */
export function SchematicEditor() {
  return (
    <ReactFlowProvider>
      <SchematicCanvas />
    </ReactFlowProvider>
  )
}
