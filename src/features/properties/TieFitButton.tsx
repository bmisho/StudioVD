import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { ComponentInstanceId } from "@/core/schema"
import { tieFit } from "@/features/library/tieFit"
import { useDocumentStore } from "@/store/document/documentStore"

/**
 * For a zip tie, tie mount or clip with cables through it (0.2.2): its bundle size against
 * what the cables need, and a button that refits it (one undo step).
 */
export function TieFitButton({ instance }: { instance: ComponentInstanceId }) {
  // Re-read whenever cables or the component change.
  useDocumentStore((s) => s.doc.connectors)
  useDocumentStore((s) => s.doc.components)
  const [problem, setProblem] = useState<string | null>(null)
  const fit = tieFit(instance)
  if (!fit) return null
  const same = Math.abs(fit.fits - fit.current) < 1e-9
  return (
    <div className="flex flex-col gap-1 text-xs">
      <p className="text-muted-foreground tabular-nums">
        {fit.cables} {fit.cables === 1 ? "cable runs" : "cables run"} through it: a Ø{fit.fits} mm
        bundle; it is sized for Ø{fit.current} mm.
      </p>
      {!same && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 self-start text-xs"
          onClick={() => void fit.apply().then(setProblem)}
        >
          Fit to its cables
        </Button>
      )}
      {problem && (
        <p role="alert" className="text-destructive">
          {problem}
        </p>
      )}
    </div>
  )
}
