import { Box } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ResultsButton } from "@/features/simulation/ResultsButton"
import { AddBlockMenu } from "./AddBlockMenu"

/** Above the schematic: add a built-in block or a new black box. */
export function SchematicToolbar({
  onAddBlock,
  onAddBlackBox,
}: {
  onAddBlock: (modelKey: string) => void
  onAddBlackBox: () => void
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Schematic tools">
      <AddBlockMenu onPick={onAddBlock} />
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 bg-background px-2 text-xs"
        onClick={onAddBlackBox}
        title="A block whose ports and behaviour you define"
      >
        <Box className="size-3.5" aria-hidden />
        Black box
      </Button>
      <ResultsButton />
    </div>
  )
}
