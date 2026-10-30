import { useMemo } from "react"
import { APP_VERSION } from "@/core/app-info"
import { GENERATORS } from "@/core/generators/registry"
import { generatorItems, installedItems, type LibraryItem } from "@/core/library/items"
import { useLibraryStore } from "@/store/session/libraryStore"

const GENERATOR_ITEMS = generatorItems(GENERATORS)

/** Every card: generator presets (built in), then installed and user components. */
export function useLibraryItems(): LibraryItem[] {
  const installed = useLibraryStore((s) => s.installed)
  return useMemo(() => [...GENERATOR_ITEMS, ...installedItems(installed, APP_VERSION)], [installed])
}
