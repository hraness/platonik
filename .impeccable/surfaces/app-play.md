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

FIRST VIEWPORT: Compact title, next useful goal and run control above a large pan-and-zoom world. A machine hotbar sits beneath the scene and an inspector sits at right. On phones the world retains a useful camera scale and inspector follows it. Signature interaction: choose a machine, aim its sprite at a real tile, place its construction site, then watch the crew fund it.

FORM: User-pinned factory-builder convention, executed in the existing shared shell. No concept tournament: the user explicitly selected the Factorio-like path. Engine-driven code-led composition; atlas art supplies the physical world.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
