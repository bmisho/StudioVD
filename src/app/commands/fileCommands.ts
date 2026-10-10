import type { Result } from "@/lib/tauri/result"
import type { Command, CommandDeps } from "./types"

/**
 * Wraps a backend call: reports failures with the action name, and drops re-entrant runs
 * while a call is in flight (a held Ctrl+S or a double click must not open two dialogs).
 */
function backendCommand(
  deps: CommandDeps,
  action: string,
  call: () => Promise<Result<void>>
): () => Promise<void> {
  let inFlight = false
  return async () => {
    if (inFlight) return
    inFlight = true
    try {
      const result = await call()
      if (!result.ok) deps.reportError(result.error, action)
    } finally {
      inFlight = false
    }
  }
}

export function fileCommands(deps: CommandDeps): Command[] {
  const { backend } = deps
  return [
    {
      id: "file.new",
      label: "New",
      shortcuts: ["Ctrl+N"],
      allowInTextInput: true,
      run: backendCommand(deps, "New project", backend.newProject),
    },
    {
      id: "file.open",
      label: "Open…",
      shortcuts: ["Ctrl+O"],
      allowInTextInput: true,
      run: backendCommand(deps, "Open", backend.openProject),
    },
    {
      id: "file.save",
      label: "Save",
      shortcuts: ["Ctrl+S"],
      allowInTextInput: true,
      run: backendCommand(deps, "Save", backend.saveProject),
    },
    {
      id: "file.saveAs",
      label: "Save As…",
      shortcuts: ["Ctrl+Shift+S"],
      allowInTextInput: true,
      run: backendCommand(deps, "Save As", backend.saveProjectAs),
    },
    {
      id: "file.import",
      label: "Import…",
      shortcuts: ["Ctrl+I"],
      allowInTextInput: true,
      run: backendCommand(deps, "Import", backend.importFiles),
    },
    {
      id: "file.exportGlb",
      label: "glTF Binary (.glb)…",
      run: backendCommand(deps, "Export GLB", () => backend.exportScene("glb")),
    },
    {
      id: "file.exportStl",
      label: "STL (.stl)…",
      run: backendCommand(deps, "Export STL", () => backend.exportScene("stl")),
    },
    { id: "file.exit", label: "Exit", run: backendCommand(deps, "Exit", backend.closeWindow) },
  ]
}
