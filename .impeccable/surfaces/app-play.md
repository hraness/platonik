---
version: 1
slug: "app-play"
primary_target: "app/play"
related_targets: ["components/play/living-world.tsx","components/play/world-stage.tsx","components/play/frontier-map.tsx","app/play/world.css"]
---

# Play / frontier

Experience with an Operate workshop. The user's direction is a playable Factorio-like open world with recognizable things, replacing the abstract diagram. Their request authorizes direct browser play; Rust remains the sole simulation and admission authority.

## Direction contract

THESIS: A small working settlement in a tangible space-western landscape; make a machine, feed it, watch it work, expand. The map leads rather than a page of explanations.

OWN-WORLD: Keep shared site typography and accessible controls. The game ground uses sun-warmed soil, copper ore and oxidized teal machinery, with original raster sprites. Low visual noise around the map, precise production overlays only when useful. The daylight frontier is legible in a normal bright room; site chrome still follows appearance preference.

STORY: Start the crew, make parts and frames, place the first freight crane, then explore and extend the settlement. Existing worlds stay recoverable. The agent remains available for deeper design.

FIRST VIEWPORT: Compact title and save status, a run/advance control row, and the next useful goal lead into the pan-and-zoom world. The five-machine hotbar sits beneath the scene. A native selector and inspector sit at right; an active construction or freight-route plan replaces them beside the map. On phones the inspector or active plan follows immediately after the hotbar. Telemetry, timeline, beacon status, and crew history span the stage below both columns. Signature interaction: choose a machine, aim its sprite at a real tile, place its construction site, then watch the crew fund it.

RESPONSIVE: The title uses a 28–36px desktop clamp and becomes 30px at 800px. The inspector column is 300px, narrows to 270px at 1000px, and stacks at 800px. Desktop map height is `clamp(300px, min(54svh, calc(100svh - 400px)), 660px)`; at 800px it becomes `clamp(300px, 42svh, 420px)`. At 520px, live controls use two columns, machine names remain 12px, and full costs remain in the construction plan while small hotbar cost lines are hidden. Keep a useful camera scale rather than shrinking the whole region to fit.

INTERACTION: The map and stage clip their own artwork; focus belongs to the root camera SVG without scrolling the page. Pointer drag changes only the camera. A labeled native selector exposes every machine and cell, including the stationary Foundry; choosing an entry locates it, and map selection updates the same control. Locate on map follows the selected name and position. Escape cancels plans and returns map focus. Selecting an entity preserves a live run; planning pauses it. Latest returns from history to the current recorded state without advancing the engine. Worlds & files collects saves, revisions, import, export, sharing, and new-world actions.

FORM: User-pinned factory-builder convention, executed in the existing shared shell. No concept tournament: the user explicitly selected the Factorio-like path. Engine-driven code-led composition; atlas art supplies the physical world.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
