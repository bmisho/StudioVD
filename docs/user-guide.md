# StudioVD user guide

StudioVD builds an assembly from CAD parts, makes it move like the real mechanism, and maps
what it does electrically, mechanically, with fluids and with light in a schematic that solves
as you edit. This guide follows a project from empty to simulated. Keyboard shortcuts are
listed under Help › Keyboard Shortcuts (F1).

## The window

- **Left**: the Scene tree (groups, parts, mates) and the Library.
- **Centre**: the 3D view and the schematic, side by side or stacked (View menu); either can
  be maximized from its header.
- **Right**: Properties of what is selected.
- **Bottom**: the status bar (unsaved changes, selection, mode, the simulation's state).

Mouse (default, SolidWorks-style): middle-drag orbits, Ctrl+middle-drag pans, the wheel zooms
to the cursor. Other presets (Fusion, Onshape, Blender) are under View › Mouse Navigation.
F fits everything; Ctrl+1…7 are the standard views.

## Parts

- **File › Import** (Ctrl+I) or drop files on the window: STEP, IGES, glTF/GLB, OBJ, STL.
  STL and OBJ ask for their unit (mm by default); a model's hierarchy becomes groups.
- **Downloads as a zip** (GrabCAD and similar sites): pick or drop the `.zip` itself. The
  Import dialog lists the models inside (with the materials and textures they name); anything
  else is listed as skipped. Native CAD files (SolidWorks `.SLDPRT`/`.SLDASM`, Inventor,
  Fusion, CATIA...) cannot be read: download or export STEP instead. StudioVD never fetches
  from those sites itself, and a downloaded model keeps the licence its author gave it.
- Select in the 3D view or the tree; Ctrl-click adds or removes. **Drag** a part (or a
  library component) in the 3D view to slide it along the ground; hold **Shift** to move it
  straight up or down. Everything mated to it moves along, and each drag is one undo step.
  Move (T) and rotate (R) with the gizmo for exact moves; a right click opens a context menu.
  Ctrl+G groups, Delete deletes, Ctrl+Z / Ctrl+Y undo and redo every change.
- **Materials**: pick a preset or make your own in the part's Material section (colour,
  metal, roughness, glass, emissive, density for mass, texture maps). A slot of a multi-colour
  import can have its own material.
- **Display style** (View): shaded, shaded with edges, wireframe, X-ray.

## Assembling

1. **Place Anchor** (toolbar): hover a face, edge or hole; StudioVD proposes a point, plane
   or axis; click to place it. Anchors carry interface tags (`bore-8mm`) used for snapping.
2. **Mate** (toolbar): pick two anchors and a type (fixed, revolute, prismatic, spherical).
   The part that is not grounded moves onto the other; flip and angle offset adjust it.
   Revolute and prismatic mates can have limits.
3. **Couple** two mates (select both): gears, rack and pinion, lead screw, with the ratio
   suggested from the parts.
4. Ground a part (Edit › Grounded) to fix it in place. The tree shows each moving part's
   degrees of freedom and any conflict.

## Cables

Select two anchors (a lug, a pad, a jack's contact: any point or axis) and choose **Cable**
in Properties. A cable leaves each end straight along its anchor, then curves to the other.

- **Length (mm)** is the length as cut. Properties show the route and the spare; the spare is
  laid as **Arcs** (bulging away from the surfaces its ends are on), **Waves** or one **Coil**.
  A cable shorter than its route is drawn taut and marked "Too short by … mm" (in Properties
  and the Scene tree); **Fit to route + 10%** cuts it to fit. It is never stretched.
- **Route**: **Add waypoint** routes it through any other anchor, such as a cable clip's or
  zip tie's "Cable through" anchor or an anchor you placed on a wall; reorder or remove
  waypoints with the arrows. Deleting a waypoint's part takes it out of the route; deleting an
  end deletes the cable.
- **Look**: a wire colour (one shared material per colour), a hook-up wire size (16–30 AWG
  sets the diameter), **One wire** or a **Twisted pair** (one twist every … mm), and how far it
  leaves each end straight.
- **File › Export › Cable Cut List (.csv)** lists every cable: name, colour, diameter, wires,
  length, waypoints, and a note for one that is too short.

Cables are drawn, not simulated: they pass through parts (waypoints are how you steer them)
and never move a part.

## Testing the mechanism

**Test mode** (toolbar) runs physics with collisions: drag a part and everything mated to it
follows its joints; parts that overlap at the start are listed and ignore each other. Each
part's collision shape (hull, convex pieces, box, exact mesh for grounded parts, none) is in
its Properties. Mate readouts show the live angle or travel. **Apply Pose** keeps the pose you
tested as one undo step; leaving test mode otherwise restores the design pose.

## The library

The Library tab lists:

- **Generators**: screws, nuts, washers, bearings, gears, pulleys, belts, springs, lead screws,
  profiles, batteries, connectors, enclosures, primitives; edit their parameters after insert.
  For pedals and other small electronics: potentiometers (the shaft turns on a ±150° mate that
  a binding can read), knobs, panel jacks (6.35 mm mono/stereo, DC), 3PDT/DPDT footswitches,
  a 9 V battery with snap leads, a circuit board with mounting holes and wire pads, a 5 mm LED,
  cable clips and zip ties. Panel parts mate behind a panel hole by their bushing; their lugs
  and pads are anchors to start cables from. Sizes are typical starting values: check the
  datasheet of the part you buy.
- **Installed** and **My components**: packs you installed and components you saved
  (select parts, Edit › Save as Component…).
- **Online catalog**: electronic parts and boards from KiCad's libraries, and more. Press
  **Refresh** in the catalog bar (shown under All sources and Online catalog; the first time
  it asks before connecting), pick a card and download its pack; then drag it in like any
  other card (see Network below).
- **Schematic primitives**: every built-in schematic block.

Drag a card into the 3D view (it snaps onto a fitting anchor, else onto the surface under the
cursor, else the ground; R turns it, Alt skips snapping) or press Enter / Insert to place it in
the middle of the view. A component is inserted as one undo step and selected as a group;
double-click it to edit inside. **Install components from a file** accepts `.stvdpack` files;
packs not vouched for by the signed catalog are marked Unverified. When a newer version of a
placed component is installed or in the catalog, its Properties offer **Update** (keeps mates
to it) or, for a new major version, **Replace**.

## The schematic

Add blocks from the schematic toolbar (or the Library's primitives) and draw wires between
ports. Colours, line patterns and port shapes show the domain (electrical, mechanical,
fluid, light, data); a wire that cannot connect says why while you drag. A block's Properties
hold its parameters (type `4.7k`, `100n`, `10u`); a **black box** has your own ports,
parameters and behaviour written as expressions. Link a block to parts to show the
relation, and export the schematic as SVG or PNG (File › Export).

The **simulation** solves the steady state as you edit: readouts on blocks, current flow on
wires, an operating point per block, and findings (no ground, overloads, stalls) under
Results in the status bar. Gravity (Simulation settings) loads parts and joints.

## Bindings

**Bind…** in a mate's, part's or block's Properties links the 3D model and the schematic:
a hinge angle drives a potentiometer, a part's weight a motor's torque, a contact a switch,
the distance and line of sight between two anchors a light sensor; block outputs light up
parts (glow, tint), draw arrows and labels, or show a commanded pose. In test mode the loop
runs live. Help › Examples builds small projects that show each kind. **Guitar pedal** puts
it together: a see-through enclosure with pots, knobs, jacks, a footswitch, an LED, a battery
and a board, wired with cables of set lengths (two through clips); in test mode, turning the
Volume knob dims or brightens the LED through the schematic.

## Projects

File › New, Open, Save (Ctrl+S), Save As. A project is one `.stvd` file holding the scene,
its geometry, textures and licences, so it opens on any machine without the library.
StudioVD autosaves in the background and offers recovery after a crash. Help › Project
Credits lists the licences of every component used; exports carry them too.

## Network

StudioVD works offline. It goes online only when you ask (Refresh the catalog, Download a
pack, Test connection) or, if you opt in, to look for catalog updates once a week. The first
time, it asks before connecting and names the hosts. **Edit › Network Settings** has Offline
mode, the proxy (system, none or manual), an extra trusted certificate for networks that
inspect TLS, a mirror address, and a connection test that says what fails. On a network
StudioVD cannot get through, download packs in a browser and use Install from file.

## Files and folders

- Library: Windows `%LOCALAPPDATA%\com.studiovd.desktop\library`, Linux
  `~/.local/share/com.studiovd.desktop/library`.
- Log: `…\com.studiovd.desktop\logs\studiovd.log` (Linux: `~/.local/share/com.studiovd.desktop/logs`).
- Settings that follow the machine (mouse preset, network) stay out of projects.
