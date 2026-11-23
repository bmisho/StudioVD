import { useEffect, useState } from "react"

/**
 * The third-party notices shipped with the app (`public/third-party-notices.txt`, PLAN 15.8),
 * read from the app's own files (never the network) when Help › About shows them.
 */
export function NoticesView() {
  const [text, setText] = useState<string | null>(null)
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
  return (
    <pre
      aria-label="Third-party notices"
      tabIndex={0}
      className="max-h-80 overflow-auto rounded-md border bg-surface p-2 font-mono text-[11px] whitespace-pre-wrap focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {text ?? "Loading…"}
    </pre>
  )
}
