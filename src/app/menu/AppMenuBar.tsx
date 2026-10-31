import {
  Menubar,
  MenubarContent,
  MenubarMenu,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar"
import { OpenRecentMenu } from "@/features/project/OpenRecentMenu"
import { CommandMenuItem } from "./CommandMenuItem"
import { CommandRadioGroup } from "./CommandRadioGroup"

const triggerClass = "h-6 px-2 py-0 text-xs"

export function AppMenuBar() {
  return (
    <Menubar
      aria-label="Main menu"
      className="h-8 shrink-0 gap-0 rounded-none border-x-0 border-t-0 bg-surface px-1 shadow-none"
    >
      <span className="px-2 text-xs font-semibold tracking-wide text-primary">StudioVD</span>

      <MenubarMenu>
        <MenubarTrigger className={triggerClass}>File</MenubarTrigger>
        <MenubarContent>
          <CommandMenuItem id="file.new" />
          <CommandMenuItem id="file.open" />
          <OpenRecentMenu />
          <MenubarSeparator />
          <CommandMenuItem id="file.save" />
          <CommandMenuItem id="file.saveAs" />
          <CommandMenuItem id="file.close" />
          <MenubarSeparator />
          <CommandMenuItem id="file.import" />
          <MenubarSub>
            <MenubarSubTrigger>Export</MenubarSubTrigger>
            <MenubarSubContent>
              <CommandMenuItem id="file.exportGlb" />
              <CommandMenuItem id="file.exportStl" />
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <CommandMenuItem id="file.exit" />
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={triggerClass}>Edit</MenubarTrigger>
        <MenubarContent>
          <CommandMenuItem id="edit.undo" />
          <CommandMenuItem id="edit.redo" />
          <MenubarSeparator />
          <CommandMenuItem id="edit.newGroup" />
          <CommandMenuItem id="edit.delete" />
          <CommandMenuItem id="part.toggleGrounded" />
          <CommandMenuItem id="library.saveAsComponent" />
          <MenubarSeparator />
          <CommandRadioGroup ids={["transform.translate", "transform.rotate"]} />
          <CommandMenuItem id="edit.clearSelection" />
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={triggerClass}>View</MenubarTrigger>
        <MenubarContent>
          <CommandMenuItem id="view.fitAll" />
          <CommandMenuItem id="view.toggleVisibility" />
          <CommandMenuItem id="view.showAll" />
          <CommandMenuItem id="view.isolate" />
          <MenubarSub>
            <MenubarSubTrigger>Standard Views</MenubarSubTrigger>
            <MenubarSubContent>
              <CommandMenuItem id="view.orient.front" />
              <CommandMenuItem id="view.orient.back" />
              <CommandMenuItem id="view.orient.left" />
              <CommandMenuItem id="view.orient.right" />
              <CommandMenuItem id="view.orient.top" />
              <CommandMenuItem id="view.orient.bottom" />
              <MenubarSeparator />
              <CommandMenuItem id="view.orient.isometric" />
            </MenubarSubContent>
          </MenubarSub>
          <CommandMenuItem id="view.toggleProjection" />
          <MenubarSub>
            <MenubarSubTrigger>Display Style</MenubarSubTrigger>
            <MenubarSubContent>
              <CommandRadioGroup
                ids={[
                  "view.display.shaded",
                  "view.display.shadedEdges",
                  "view.display.wireframe",
                  "view.display.xray",
                ]}
              />
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>Mouse Navigation</MenubarSubTrigger>
            <MenubarSubContent>
              <CommandRadioGroup
                ids={[
                  "view.navigation.solidworks",
                  "view.navigation.fusion",
                  "view.navigation.onshape",
                  "view.navigation.blender",
                ]}
              />
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <CommandMenuItem id="view.toggleSplit" />
          <CommandMenuItem id="view.maximizeViewport" />
          <CommandMenuItem id="view.maximizeSchematic" />
          <MenubarSeparator />
          <CommandMenuItem id="view.toggleLeftPanel" />
          <CommandMenuItem id="view.toggleRightPanel" />
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={triggerClass}>Help</MenubarTrigger>
        <MenubarContent>
          <CommandMenuItem id="dev.insertTestRig" />
          <MenubarSeparator />
          <CommandMenuItem id="help.about" />
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
