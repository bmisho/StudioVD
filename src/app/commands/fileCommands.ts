import type { Result } from "@/lib/tauri/result"
import type { Command, CommandDeps } from "./types"

function backendCommand(deps: CommandDeps, call: () => Promise<Result<void>>): () => Promise<void> {
  return async () => {
    const result = await call()
    if (!result.ok) deps.reportError(result.error)
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
      run: backendCommand(deps, backend.newProject),
    },
    {
      id: "file.open",
      label: "Open…",
      shortcuts: ["Ctrl+O"],
      allowInTextInput: true,
      run: backendCommand(deps, backend.openProject),
    },
    {
      id: "file.save",
      label: "Save",
      shortcuts: ["Ctrl+S"],
      allowInTextInput: true,
      run: backendCommand(deps, backend.saveProject),
    },
    {
      id: "file.saveAs",
      label: "Save As…",
      shortcuts: ["Ctrl+Shift+S"],
      allowInTextInput: true,
      run: backendCommand(deps, backend.saveProjectAs),
    },
    {
      id: "file.import",
      label: "Import…",
      shortcuts: ["Ctrl+I"],
      allowInTextInput: true,
      run: backendCommand(deps, backend.importFiles),
    },
    {
      id: "file.exportGlb",
      label: "glTF Binary (.glb)…",
      run: backendCommand(deps, () => backend.exportScene("glb")),
    },
    {
      id: "file.exportStl",
      label: "STL (.stl)…",
      run: backendCommand(deps, () => backend.exportScene("stl")),
    },
    { id: "file.exit", label: "Exit", run: backendCommand(deps, backend.closeWindow) },
  ]
}
