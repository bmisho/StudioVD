import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

/** Where the licence texts start: the first separator line of the notices file. */
const TEXTS_START = `\n${"=".repeat(78)}\n`

/**
 * The third-party notices shipped with the app (`public/third-party-notices.txt`, PLAN 15.8),
 * read from the app's own files (never the network) when Help › About shows them. The
 * package list shows at once; the licence texts (about 2 MB, slow to lay out on a modest
 * machine) only when asked for.
 */
export function NoticesView() {
  const [text, setText] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  useEffect(() => {
    let cancelled = false
    void fetch("/third-party-notices.txt")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(
        (t) => !cancelled && setText(t),
        () => !cancelled && setText("The notices could not be read.")
      )
    return () => {
      cancelled = true
    }
  }, [])
  const split = text?.indexOf(TEXTS_START) ?? -1
  const shown = text === null ? "Loading…" : full || split < 0 ? text : text.slice(0, split)
  return (
    <div className="flex flex-col gap-2">
      <pre
        aria-label="Third-party notices"
        tabIndex={0}
        className="max-h-80 overflow-auto rounded-md border bg-surface p-2 font-mono text-[11px] whitespace-pre-wrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {shown}
      </pre>
      {text !== null && split >= 0 && !full && (
        <div>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setFull(true)}>
            Show the licence texts
          </Button>
        </div>
      )}
    </div>
  )
}
