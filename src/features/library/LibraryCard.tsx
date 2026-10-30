import {
  BatteryFull,
  Box,
  CircleDot,
  Cog,
  Disc3,
  Frame,
  MoveVertical,
  Package,
  Plug,
  Shapes,
  Spline,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { LibraryBadge, LibraryItem } from "@/core/library/items"
import { libraryFileUrl } from "@/lib/tauri/library"
import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
  fasteners: Wrench,
  bearings: CircleDot,
  gears: Cog,
  pulleys: Disc3,
  motion: MoveVertical,
  springs: Spline,
  frame: Frame,
  connectors: Plug,
  batteries: BatteryFull,
  enclosures: Box,
  primitives: Shapes,
}

const BADGES: Record<LibraryBadge, { label: string; className: string }> = {
  official: { label: "Official", className: "text-primary" },
  user: { label: "User", className: "text-foreground" },
  unverified: { label: "Unverified", className: "text-warning" },
  newer: { label: "Needs newer StudioVD", className: "text-muted-foreground" },
  invalid: { label: "Invalid", className: "text-destructive" },
}

export const CARD_HEIGHT = 52

/** One card of the Library list (presentational; the list owns focus and pointer input). */
export function LibraryCard({ item, active }: { item: LibraryItem; active: boolean }) {
  const Icon = ICONS[item.category.find((c) => Object.hasOwn(ICONS, c)) ?? ""] ?? Package
  return (
    <div
      className={cn(
        "flex h-full items-center gap-2 rounded-md px-2 text-xs",
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent-subtle",
        !item.insert && "opacity-70"
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded border bg-background">
        {item.thumbnail ? (
          <img
            src={libraryFileUrl(item.thumbnail, "png")}
            alt=""
            className="size-9 rounded object-contain"
            draggable={false}
          />
        ) : (
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.name}</p>
        <p className={cn("truncate", active ? "text-accent-foreground" : "text-muted-foreground")}>
          {item.detail}
          {item.badges.map((b) => (
            <span
              key={b}
              className={cn(
                "ml-1.5 font-medium",
                active ? "text-accent-foreground" : BADGES[b].className
              )}
            >
              · {BADGES[b].label}
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}
