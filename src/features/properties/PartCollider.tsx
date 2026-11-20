import { useId } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ColliderKind, PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"

const KINDS: { value: ColliderKind; label: string; hint: string }[] = [
  { value: "hull", label: "Convex hull", hint: "Fast. Fills holes and hollows." },
  {
    value: "decomposed",
    label: "Convex pieces",
    hint: "Keeps holes open (a shaft in a bore). Computed once, when test mode starts.",
  },
  {
    value: "trimesh",
    label: "Exact mesh",
    hint: "Exact but hollow: for grounded parts only (a moving one uses its hull).",
  },
  { value: "box", label: "Bounding box", hint: "Fastest, least exact." },
  { value: "none", label: "None", hint: "Touches nothing. It still has its mass." },
]

/** How the part collides in test mode (PLAN 10.2): one undo entry per change. */
export function PartCollider({ id }: { id: PartId }) {
  const fieldId = useId()
  const collider = useDocumentStore((s) => s.doc.parts[id]?.collider)
  const grounded = useDocumentStore((s) => s.doc.parts[id]?.grounded ?? false)
  const setCollider = useDocumentStore((s) => s.setPartsCollider)
  if (!collider) return null
  const current = KINDS.find((k) => k.value === collider)
  const fallback = collider === "trimesh" && !grounded
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={fieldId} className="text-xs">
        Collision shape
      </Label>
      <Select value={collider} onValueChange={(v) => setCollider([id], v as ColliderKind)}>
        <SelectTrigger id={fieldId} size="sm" className="h-7 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {KINDS.map((k) => (
            <SelectItem key={k.value} value={k.value} className="text-xs">
              {k.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {fallback ? "Not grounded: test mode uses its convex hull." : current?.hint}
      </p>
    </div>
  )
}
