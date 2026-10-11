import { useSessionStore } from "@/store/session/sessionStore"

/** Shown while the graphics context is lost; the view restores itself or the panel resets. */
export function ViewportStatusOverlay() {
  const lost = useSessionStore((s) => s.viewportGpu === "lost")
  if (!lost) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
      <p role="status" className="rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">
        Graphics context lost. Restoring the 3D view…
      </p>
    </div>
  )
}
