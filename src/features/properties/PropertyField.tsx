/** Read-only label/value row used by the inspectors. */
export function PropertyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate tabular-nums" title={value}>
        {value}
      </span>
    </div>
  )
}
