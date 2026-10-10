import { useDocumentStore } from "@/store/document/documentStore"
import { PropertyField } from "./PropertyField"

/** Shown when nothing is selected. */
export function ProjectProperties() {
  const name = useDocumentStore((s) => s.doc.project.name)
  const groupCount = useDocumentStore((s) => Object.keys(s.doc.groups).length)
  const partCount = useDocumentStore((s) => Object.keys(s.doc.parts).length)
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold">Project</h3>
      <PropertyField label="Name" value={name} />
      <PropertyField label="Units" value="mm" />
      <PropertyField label="Groups" value={String(groupCount)} />
      <PropertyField label="Parts" value={String(partCount)} />
    </div>
  )
}
