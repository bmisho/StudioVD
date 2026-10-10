/** Stand-in for the React Three Fiber canvas (Phase 3). Uses the viewport gradient tokens. */
export function ViewportPlaceholder() {
  return (
    <div
      data-testid="viewport-placeholder"
      className="flex h-full items-center justify-center bg-linear-to-b from-viewport-top to-viewport-bottom"
    >
      <p className="text-xs text-muted-foreground">3D viewport arrives in Phase 3</p>
    </div>
  )
}
