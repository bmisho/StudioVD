import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LibraryPanel } from "@/features/library/LibraryPanel"
import { SceneGraphPanel } from "@/features/scene-graph/SceneGraphPanel"

export function LeftSidebar() {
  return (
    <aside aria-label="Scene and Library" className="h-full select-none">
      <Tabs defaultValue="scene" className="flex h-full flex-col gap-0 bg-background">
        <div className="flex h-9 shrink-0 items-center border-b bg-surface px-1">
          <TabsList className="h-7 w-full">
            <TabsTrigger value="scene" className="text-xs">
              Scene
            </TabsTrigger>
            <TabsTrigger value="library" className="text-xs">
              Library
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="scene" className="min-h-0">
          <SceneGraphPanel />
        </TabsContent>
        <TabsContent value="library" className="min-h-0">
          <LibraryPanel />
        </TabsContent>
      </Tabs>
    </aside>
  )
}
