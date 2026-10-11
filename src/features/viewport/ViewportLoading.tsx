/** Shown while the 3D view's code chunk loads. Same gradient tokens as the viewport. */
export function ViewportLoading() {
  return (
    <div
      data-testid="viewport-loading"
      className="flex h-full items-center justify-center bg-linear-to-b from-viewport-top to-viewport-bottom"
    >
      {/* On a white chip: muted text on the gradient's slate-200 end is below 4.5:1. */}
      <p className="rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">
        Loading the 3D view…
      </p>
    </div>
  )
}
