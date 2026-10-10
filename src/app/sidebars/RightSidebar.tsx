import { PropertiesPanel } from "@/features/properties/PropertiesPanel"

export function RightSidebar() {
  return (
    <aside aria-label="Properties" className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center border-b bg-surface px-3">
        <h2 className="text-xs font-medium text-muted-foreground">Properties</h2>
      </div>
      <div className="min-h-0 flex-1">
        <PropertiesPanel />
      </div>
    </aside>
  )
}
