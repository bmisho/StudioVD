import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { UserComponentForm } from "@/core/library/userComponent/build"
import { slugFor, tagsFrom } from "@/core/library/userComponent/keys"
import { USER_LICENCES, type UserLicence } from "@/core/library/userComponent/licence"
import { SEMVER_PATTERN } from "@/core/schema"

const CATEGORIES = [
  "mechanical",
  "electrical",
  "fasteners",
  "structure",
  "motion",
  "enclosures",
  "other",
]

/** Why the form cannot be saved yet, or null. */
function problem(form: UserComponentForm, taken: readonly string[]): string | null {
  if (!form.name.trim()) return "Give it a name."
  if (!SEMVER_PATTERN.test(form.version)) return "The version must look like 1.0.0."
  if (taken.includes(form.version)) return `Version ${form.version} is already in your library.`
  if (form.designatorPrefix && !/^[A-Z]{1,4}$/.test(form.designatorPrefix))
    return "The designator prefix is 1 to 4 capital letters."
  if (USER_LICENCES[form.licence].needsAuthor && !form.author.trim())
    return "CC BY needs the name to credit."
  return null
}

function Field({ label, children, id }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  )
}

/** The fields of Save as component (PLAN 9.7); `taken` lists versions saved for a slug. */
export function SaveComponentForm(props: {
  defaults: UserComponentForm
  namespace: string
  busy: boolean
  error: string | null
  taken: (slug: string) => string[]
  onSave: (form: UserComponentForm) => void
  onCancel: () => void
}) {
  const id = useId()
  const [form, setForm] = useState(props.defaults)
  const [tags, setTags] = useState(props.defaults.tags.join(", "))
  const slug = slugFor(form.name)
  const next = { ...form, slug, tags: tagsFrom(tags) }
  const why = problem(next, props.taken(slug))
  const set = (patch: Partial<UserComponentForm>) => setForm((f) => ({ ...f, ...patch }))
  const input = "h-7 text-xs"
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!why && !props.busy) props.onSave(next)
      }}
    >
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <Field label="Name" id={`${id}-name`}>
          <Input
            id={`${id}-name`}
            className={input}
            value={form.name}
            maxLength={80}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label="Version" id={`${id}-version`}>
          <Input
            id={`${id}-version`}
            className={`${input} tabular-nums`}
            value={form.version}
            onChange={(e) => set({ version: e.target.value.trim() })}
          />
        </Field>
      </div>
      <p className="truncate text-xs text-muted-foreground tabular-nums">
        Saved as {props.namespace}/{slug}
      </p>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <Field label="Category" id={`${id}-category`}>
          <Select value={form.category} onValueChange={(category) => set({ category })}>
            <SelectTrigger id={`${id}-category`} size="sm" className="h-7 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...new Set([form.category, ...CATEGORIES])].map((c) => (
                <SelectItem key={c} value={c} className="text-xs">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Designator prefix" id={`${id}-prefix`}>
          <Input
            id={`${id}-prefix`}
            className={input}
            value={form.designatorPrefix}
            placeholder="U"
            maxLength={4}
            onChange={(e) =>
              set({ designatorPrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })
            }
          />
        </Field>
      </div>
      <Field label="Tags (comma separated)" id={`${id}-tags`}>
        <Input
          id={`${id}-tags`}
          className={input}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </Field>
      <Field label="Summary" id={`${id}-summary`}>
        <Input
          id={`${id}-summary`}
          className={input}
          value={form.summary}
          maxLength={280}
          onChange={(e) => set({ summary: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Licence" id={`${id}-licence`}>
          <Select value={form.licence} onValueChange={(v) => set({ licence: v as UserLicence })}>
            <SelectTrigger id={`${id}-licence`} size="sm" className="h-7 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(USER_LICENCES) as UserLicence[]).map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {USER_LICENCES[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label={USER_LICENCES[form.licence].needsAuthor ? "Author (credited)" : "Author"}
          id={`${id}-author`}
        >
          <Input
            id={`${id}-author`}
            className={input}
            value={form.author}
            maxLength={120}
            onChange={(e) => set({ author: e.target.value })}
          />
        </Field>
      </div>
      {(props.error ?? why) && (
        <p role="alert" className="text-xs text-destructive">
          {props.error ?? why}
        </p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.busy}
          onClick={props.onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={props.busy || why !== null}>
          {props.busy ? "Saving…" : "Save to My components"}
        </Button>
      </DialogFooter>
    </form>
  )
}
