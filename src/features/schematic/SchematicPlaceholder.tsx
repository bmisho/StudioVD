/** Stand-in for the React Flow schematic editor (Phase 11), with its dot-grid background. */
export function SchematicPlaceholder() {
  return (
    <div
      data-testid="schematic-placeholder"
      className="flex h-full items-center justify-center bg-background bg-[radial-gradient(var(--color-input)_1px,transparent_1px)] bg-size-[16px_16px]"
    >
      <p className="rounded-sm bg-background px-2 text-xs text-muted-foreground">
        Schematic editor arrives in Phase 11
      </p>
    </div>
  )
}
