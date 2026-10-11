import type { GroupId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { NameField } from "./NameField"

/** Group inspector: its name (one undo entry per edit). */
export function GroupProperties({ id }: { id: GroupId }) {
  const name = useDocumentStore((s) => s.doc.groups[id]?.name)
  const renameGroup = useDocumentStore((s) => s.renameGroup)
  if (name === undefined) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold">Group</h3>
      <NameField id={`group-name-${id}`} name={name} rename={(n) => renameGroup(id, n)} />
    </div>
  )
}
