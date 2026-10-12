import { useState } from "react"
import {
  MenubarItem,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
} from "@/components/ui/menubar"
import { recentProjects, type RecentProject } from "@/lib/tauri/project"
import { projectController } from "./projectService"

/** File › Open Recent: the last ten projects, read from Rust each time the menu opens. */
export function OpenRecentMenu() {
  const [items, setItems] = useState<RecentProject[] | null>(null)
  return (
    <MenubarSub
      onOpenChange={(open) => {
        if (!open) return
        void recentProjects().then((r) => setItems(r.ok ? r.value : []))
      }}
    >
      <MenubarSubTrigger>Open Recent</MenubarSubTrigger>
      <MenubarSubContent className="max-w-80">
        {items === null || items.length === 0 ? (
          <MenubarItem disabled>{items === null ? "Loading…" : "No recent projects"}</MenubarItem>
        ) : (
          items.map((item) => (
            <MenubarItem
              key={item.id}
              title={item.folder}
              onSelect={() => void projectController.openRecent(item.id)}
            >
              <span className="truncate">{item.name}</span>
              {item.missing && <span className="ml-auto text-xs">(missing)</span>}
            </MenubarItem>
          ))
        )}
      </MenubarSubContent>
    </MenubarSub>
  )
}
