/** Stand-in for the React Three Fiber canvas (Phase 3). Uses the viewport gradient tokens. */
export function ViewportPlaceholder() {
  return (
    <div
      data-testid="viewport-placeholder"
      className="flex h-full items-center justify-center bg-linear-to-b from-viewport-top to-viewport-bottom"
    >
      {/* On a white chip: muted text on the gradient's slate-200 end is below 4.5:1. */}
      <p className="rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">
        3D viewport arrives in Phase 3
      </p>
    </div>
  )
}
