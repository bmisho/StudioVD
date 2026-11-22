import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/inter"
import "@/styles/globals.css"
import { App } from "@/app/App"
import { logUncaughtErrors } from "@/lib/tauri/log"

logUncaughtErrors()

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element in index.html")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
