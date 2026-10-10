import { Boxes, Cog, Cpu, Globe, User } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface LibrarySource {
  name: string
  description: string
  icon: LucideIcon
  phase: number
}

// The five sources of PLAN.md §4 / Phase 9.4. Each becomes live in the phase shown.
const SOURCES: LibrarySource[] = [
  {
    name: "Generators",
    description: "Screws, nuts, bearings, gears, pulleys, extrusions — made by the app, offline.",
    icon: Cog,
    phase: 9,
  },
  {
    name: "Installed",
    description: "Component packs downloaded from the online catalog.",
    icon: Boxes,
    phase: 9,
  },
  {
    name: "My components",
    description: "Parts and sub-assemblies you saved as reusable components.",
    icon: User,
    phase: 9,
  },
  {
    name: "Schematic primitives",
    description: "Sources, resistors, motors, sensors and other simulation blocks.",
    icon: Cpu,
    phase: 11,
  },
  {
    name: "Online catalog",
    description: "Browse and download electronics, motor and board packs (signed).",
    icon: Globe,
    phase: 14,
  },
]

export function LibraryPanel() {
  return (
    <ScrollArea className="h-full">
      <ul aria-label="Library sources" className="flex flex-col gap-1 p-2">
        {SOURCES.map(({ name, description, icon: Icon, phase }) => (
          <li
            key={name}
            aria-disabled="true"
            className="flex gap-2 rounded-md border bg-muted p-2 text-xs"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {name} <span className="font-normal text-muted-foreground">· Phase {phase}</span>
              </p>
              <p className="text-muted-foreground">{description}</p>
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
  )
}
