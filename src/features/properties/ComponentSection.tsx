import { Button } from "@/components/ui/button"
import type { GroupId } from "@/core/schema"
import { userComponents } from "@/features/library/libraryService"
import { editParameters, generatorOf } from "@/features/library/parameterService"
import { useDocumentStore } from "@/store/document/documentStore"
import { useLibraryStore } from "@/store/session/libraryStore"
import { ComponentSlots } from "./ComponentSlots"
import { ComponentUpdate } from "./ComponentUpdate"
import { GeneratorParamsForm } from "./GeneratorParamsForm"
import { TieFitButton } from "./TieFitButton"

const ORIGINS = {
  official: "Official catalog",
  user: "My components",
  sideloaded: "Installed from a file (unverified)",
  generator: "Built-in generator",
  project: "Harvested from a project",
} as const

/** The library component behind a group (PLAN 9.5): what it is, Edit parameters, Unlink. */
export function ComponentSection({ groupId }: { groupId: GroupId }) {
  const instance = useDocumentStore((s) =>
    Object.values(s.doc.components).find((c) => c.groupId === groupId)
  )
  const def = useDocumentStore((s) =>
    instance?.def ? s.doc.componentDefs[instance.def] : undefined
  )
  const unlink = useDocumentStore((s) => s.unlinkComponent)
  // Add to my library (PLAN 9.7): a library component this project holds that is not installed.
  const harvestable = useLibraryStore(
    (s) =>
      def !== undefined &&
      def.origin !== "generator" &&
      !s.installed.some((r) => r.id === def.id && r.version === def.version)
  )
  if (!instance) return null
  const id = instance.id
  const made = def ? generatorOf(id) : null
  const identity = def?.manifest.identity
  return (
    <section className="flex flex-col gap-2" aria-label="Component">
      <h3 className="text-xs font-semibold">Component {instance.designator}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Definition</dt>
        <dd className="truncate">{identity ? identity.name : "Unknown"}</dd>
        <dt className="text-muted-foreground">Version</dt>
        <dd className="truncate tabular-nums">
          {identity ? `${identity.id} ${identity.version}` : "n/a"}
        </dd>
        <dt className="text-muted-foreground">Source</dt>
        <dd>{def ? ORIGINS[def.origin] : "n/a"}</dd>
        <dt className="text-muted-foreground">Parts</dt>
        <dd className="tabular-nums">{Object.keys(instance.parts).length}</dd>
      </dl>
      <ComponentUpdate id={id} />
      {made && (
        <>
          <h4 className="text-xs font-medium">Parameters</h4>
          <GeneratorParamsForm
            key={def?.key}
            gen={made.gen}
            params={made.params}
            onApply={(p) => editParameters(id, p)}
          />
          <TieFitButton instance={id} />
        </>
      )}
      <ComponentSlots instance={id} />
      {harvestable && (
        <div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void userComponents.harvest(id)}
          >
            Add to my library
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Your library lacks this component; this project holds a copy of it.
          </p>
        </div>
      )}
      <div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => unlink(id)}>
          Unlink
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          Unlink keeps the parts as plain parts in this group.
        </p>
      </div>
    </section>
  )
}
