import { useMemo } from "react"
import { APP_VERSION } from "@/core/app-info"
import { GENERATORS } from "@/core/generators/registry"
import { catalogItems } from "@/core/library/catalog/catalogItems"
import { generatorItems, installedItems, type LibraryItem } from "@/core/library/items"
import { primitiveItems } from "@/core/library/primitiveItems"
import { MODELS } from "@/core/sim/models/registry"
import { useCatalogStore } from "@/store/session/catalogStore"
import { useLibraryStore } from "@/store/session/libraryStore"

const GENERATOR_ITEMS = generatorItems(GENERATORS)
const PRIMITIVE_ITEMS = primitiveItems(MODELS)

/**
 * Every card: generator presets (built in), installed and user components, the online
 * catalog's (from its verified cache), then the schematic primitives.
 */
export function useLibraryItems(): LibraryItem[] {
  const installed = useLibraryStore((s) => s.installed)
  const index = useCatalogStore((s) => s.index)
  return useMemo(
    () => [
      ...GENERATOR_ITEMS,
      ...installedItems(installed, APP_VERSION),
      ...(index ? catalogItems(index, installed, APP_VERSION) : []),
      ...PRIMITIVE_ITEMS,
    ],
    [installed, index]
  )
}
