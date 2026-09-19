---
name: "Platonik"
description: "A tangible factory frontier inside a shared, readable site shell."
colors:
  paper: "var(--hraness-palette-background)"
  ink: "var(--hraness-palette-foreground)"
  muted: "var(--hraness-palette-muted)"
  accent: "var(--hraness-palette-primary)"
  accent-foreground: "var(--hraness-palette-primary-foreground)"
  line: "var(--hraness-palette-line)"
  control-border: "var(--hraness-palette-control-border)"
  surface: "var(--hraness-palette-surface)"
  wash: "var(--hraness-palette-surface-raised)"
  focus: "var(--hraness-palette-focus)"
  success: "var(--hraness-palette-success)"
  warning: "var(--hraness-palette-warning)"
  danger: "var(--hraness-palette-danger)"
  warm-plane: "var(--hraness-material-warm-plane)"
  frontier-soil: "#a69972"
  frontier-edge: "#687567"
  frontier-road: "#c3b18a"
  frontier-label: "#3f4434"
  frontier-annotation: "#fff5d4"
  frontier-annotation-edge: "#393d2f"
  camera-paper: "#f3eedc"
  camera-ink: "#283c33"
  camera-line: "#5b6350"
  camera-hover: "#fff9e7"
  route-line: "#fff0b0"
  route-ink: "#263e39"
typography:
  marketing-display:
    fontFamily: "\"Instrument Serif\", Georgia, serif"
    fontSize: "clamp(2.75rem, 5.1vw, 4rem)"
    fontWeight: 400
    lineHeight: 1.06
    letterSpacing: "-.025em"
  marketing-headline:
    fontFamily: "\"Instrument Serif\", Georgia, serif"
    fontSize: "clamp(2.4rem, 4vw, 3.25rem)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-.02em"
  document-title:
    fontFamily: "\"Newsreader\", Georgia, \"Times New Roman\", serif"
    fontSize: "clamp(36px, 4.5vw, 52px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-.035em"
  world-title:
    fontFamily: "\"Newsreader\", Georgia, \"Times New Roman\", serif"
    fontSize: "clamp(32px, 3.5vw, 46px)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-.03em"
  prose-heading:
    fontFamily: "\"Newsreader\", Georgia, \"Times New Roman\", serif"
    fontSize: "29px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-.02em"
  body:
    fontFamily: "\"Nebula Sans\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.65
  prose:
    fontFamily: "\"Nebula Sans\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.85
  control:
    fontFamily: "\"Nebula Sans\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  workshop-title:
    fontFamily: "\"Nebula Sans\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-.01em"
  frontier-annotation:
    fontFamily: "\"Nebula Sans\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "max(.2px, calc(var(--frontier-pixel) * 12))"
    fontWeight: 600
  frontier-region:
    fontFamily: "\"Nebula Sans\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "max(.32px, calc(var(--frontier-pixel) * 14))"
    fontWeight: 600
    letterSpacing: ".015px"
  factory-process:
    fontFamily: "\"Nebula Sans\", ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.75
rounded:
  inline: "2px"
  prose: "3px"
  marketing-action: ".25rem"
  camera: "5px"
  field: "6px"
  control: ".5rem"
  marketing-figure: ".625rem"
  surface: "12px"
spacing:
  compact: "8px"
  control-gap: "10px"
  row: "12px"
  panel: "16px"
  workshop: "20px"
  section: "24px"
  site-gutter: "2rem"
  reading-gutter: "44px"
  reading-gutter-tablet: "28px"
  reading-gutter-mobile: "22px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  marketing-action:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.control}"
    rounded: "{rounded.marketing-action}"
    padding: "12px 18px"
  coordinate-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.field}"
    padding: "10px"
    width: "70px"
  camera-button:
    backgroundColor: "{colors.camera-paper}"
    textColor: "{colors.camera-ink}"
    rounded: "{rounded.camera}"
    padding: "10px 12px"
  selected-facility:
    backgroundColor: "{colors.warm-plane}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "8px"
  world-stage:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
  code-block:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.prose}"
    padding: "22px"
---

# Design System: Platonik

## Overview

**Creative North Star: "A working frontier, clearly observed"**

Platonik gives the game a physical identity: sun-warmed ground, worn copper and teal machines, ore seams, spark crystals, and small courier rovers. The surrounding interface stays quiet enough to inspect their work. The game is an Experience surface with an Operate workshop; it uses the same accessible controls and reading voice as the rest of the site.

The shared site system remains intact. The homepage uses the Hraness editorial marketing treatment, documentation uses restrained reading columns, and archived laboratories retain their data-derived diagrams. Original raster art replaces abstract physical-world markers on the current frontier; it does not replace the laboratories' scientific encodings. The surface-specific composition is recorded in `.impeccable/surfaces/app-play.md`.

This record is extracted from the current shared palette package, `app/globals.css`, `app/marketing.css`, `app/lab/lab.css`, `app/play/world.css`, the vendor marketing and Lantern material contracts, and `components/play/frontier-map.tsx`. Frontmatter records effective token bindings rather than superseded declarations earlier in the CSS cascade. It replaces the older light-only laboratory snapshot.

**Key Characteristics:**

- Recognizable machinery and couriers carry the game's visual identity.
- Shared palette roles and Nebula Sans controls adapt to appearance preference.
- Instrument Serif tells the homepage story; Newsreader heads the game and field guide.
- The daylight frontier remains stable while site chrome changes appearance.
- Production status, selection, cargo, and routes have text or shape cues alongside color.

## Colors

### Primary

The shared `accent` and `accent-foreground` roles own primary actions, links, and their paired text. `focus` follows the shared focus role. They resolve through the active Hraness palette rather than a fixed green. The initial preference is Paper with System appearance; the provider supports the shared palette and Light, Dark, and System choices. The no-JavaScript Paper fallback also follows the operating system.

### Secondary

The frontier's soil, road, landscape edge, pale annotation ink, and dark annotation edge are authored scene colors. Copper, oxidized teal, amber, and dark iron belong to the original raster atlas rather than a second CSS palette for the surrounding interface. Camera controls keep their pale paper, dark ink, and outlined shape on the landscape. Route preview lines use the recorded cream and dark green pair.

### Neutral

`paper`, `surface`, and `wash` are the shared page, reading-plane, and raised-surface roles. `ink`, `muted`, `line`, and `control-border` retain their semantic roles in every appearance. The warm plane comes from Lantern's warm tint of the active surface, not from a hard-coded light swatch. Success, warning, and danger remain palette-aware status colors for site and laboratory content.

**The Two Surfaces Rule.** Site chrome follows the shared appearance palette; the frontier landscape keeps its authored daylight colors. Do not recolor machine art when the site theme changes.

The sidecar's generated tonal ramps are Paper-light previews for the shared roles and fixed-color previews for frontier roles. They are reference strips, not replacement runtime palettes. The CSS-variable bindings in frontmatter remain normative when a user selects another appearance.

## Typography

Nebula Sans is self-hosted through the shared design kit and supplies body copy, controls, navigation, and measurements. Newsreader regular is loaded from the local font package for document, laboratory, and game headings. The homepage alone uses the vendor's Instrument Serif display face. The header wordmark is compact Nebula Sans, not the previous Newsreader treatment. Code retains the platform monospace stack.

Homepage display and section sizes use the marketing clamps in frontmatter; supporting copy is 17px with 1.6 leading, becoming 16px on narrow screens. Document title and prose roles preserve the reading site's sizes. At widths up to 480px, body text becomes 16px, prose 15px, document title 38px, and prose section headings 27px.

The world title uses the recorded desktop clamp and a 38px override at widths up to 800px. Workshop headings are semibold sans; labels and observed values stay compact, with tabular numerals for counts and ticks. Shared action buttons render at 14px because the shared button rule intentionally wins route-local size declarations. Headings wrap with balance, paragraphs with pretty wrapping, and long names can break without widening the page.

**The Screen Legibility Rule.** World annotations retain a screen-size floor as the camera zooms: 12px for quantities, cargo, construction state, and route indices; 14px for region names. Homepage production labels remain ordinary HTML text outside the scaling illustration.

The scene converts one screen pixel into world coordinates through `--frontier-pixel`, derived from camera width divided by measured viewport width. Quantity and cargo labels use the annotation token; construction state uses a slightly larger world-space base (`.21px`) with the same 12-screen-pixel floor. Route corner circles retain at least a 10-screen-pixel radius. These values are camera-aware SVG dimensions, not literal CSS font sizes for the surrounding interface.

## Layout

The shared header has a 72px minimum height, is sticky on wide screens, and becomes ordinary document flow at widths up to 760px so wrapped navigation does not cover anchored content. Its desktop gutter is at least 32px. Documentation keeps a 190px sidebar, 60px gap, 740px reading column, and 1160px shell. It stacks at 800px; reading gutters step through the recorded wide, tablet, and mobile values. Code and wide tables scroll inside their own containers.

Homepage story sections use the vendor's 70rem content measure plus shared gutters and 5rem section rhythm. The hero has its own 4rem/3rem vertical spacing, becoming 2.75rem/2rem at 760px. The factory illustration is a raster composition inside the existing opaque figure plane. Its four production labels form a separate four-column HTML row with 12px text and a 4px gap, so shrinking the art does not shrink its informative labels. Conversation rows and chapter lists retain their existing responsive reading structure.

The frontier shell grows to 1560px with 20px side clearance. Its scene and 292px workshop share one bordered stage; the workshop becomes 260px at 1000px and stacks below the scene at 800px. The map height is `clamp(420px, 56vh, 660px)` on desktop and 460px on smaller screens. Phone width changes the camera scale rather than fitting the entire region into unreadably small tiles. The world page uses 12px side clearance below 800px.

Run controls precede the scene. A short current objective sits above it, the machine bar below it, and the inspector beside or after it. The camera supports pointer dragging, arrow-key panning, plus/minus zoom, and explicit Home and Map controls. The minimap locates the current camera within the finite world. Coordinate fields provide a precise alternative for construction and route points. Historical playback controls stay separate from live simulation controls.

## Elevation & Depth

Reading planes and the workshop use opaque surfaces, fine perimeter borders, and restrained tonal grouping. The scene's sprite shading supplies physical depth without adding floating UI cards over every machine. The shared Lantern material owns subtle inset fields, raised material planes where requested, and header chrome. Header translucency uses blur with an opaque fallback; it is not a general panel treatment.

The sidecar retains the actual Lantern inset, lift, and chrome shadow formulas. Their paint changes with palette variables. The homepage keeps its established continuous material wall with supplied grain and cell seams; this decoration stays behind story content. The new frontier soil marks are map texture, and its tile grid is a placement aid.

The production marker alternates only while Rust reports work, using a 1.1-second stepped animation. Reduced-motion preference disables it. Camera motion is user-driven. The shared Lantern duration remains 160ms where its material rules use it; do not interpret that token as an instruction to animate every control.

## Shapes

The system uses open reading sections and distinct functional radii: subtle code/prose corners, compact marketing actions, 6px selection and coordinate-field corners, 8px shared action controls, and 12px stage and panel corners. One-pixel seams divide working regions. Selected construction tools receive an inset two-pixel outline; keyboard focus remains visible with an offset outline.

Frontier objects use their authored raster silhouettes with native transparency. They are not masked into geometric icons. Tile outlines, route lines, corner numbers, selection marks, and the minimap are precise geometry laid over that world. The avatar-free illustrative conversation and the old scientific diagrams retain their own existing form language.

## Components

### Actions and fields

Primary game actions use the shared filled action style with paired primary text and a minimum 44px height. Secondary actions retain the accent border and transparent background, becoming a raised surface on hover. Their edge paint comes from Lantern. Disabled controls remain labeled and do not invite a click; active async commands are disabled until the engine returns.

Coordinate fields use a 70px width, 10px padding, 42px minimum height, six-pixel corners, and the shared control border. Laboratory text fields keep the shared inset surface and caret color. Focus outlines use the semantic focus color; forced-color rules preserve visible selected and boundary states.

### Navigation and reading

The shared header contains the wordmark, Living world, Field guide, repository link, and final appearance control. Navigation wraps into a full-width row on narrow screens. The shared footer remains in document flow and owns its attribution and network links. Documentation navigation keeps a text hierarchy with an exposed current-page state. Linked document rows, code blocks, tables, and conversation rows keep the readable patterns already established on those surfaces.

### Frontier and machine workshop

One original atlas supplies drills, fabricators, assemblers, storehouses, cranes, outposts, beacons, foundries, courier rovers, ore, sparks, and scrub. `public/art/frontier/atlas.json` owns measured crop rectangles; nominal equal grid cells would clip some sprites. `provenance.md` and the PNG's embedded prompt preserve generation intent. Pixel data and native alpha remain unchanged by metadata embedding.

The build bar pairs each machine image with its name. Selection is exposed with `aria-pressed`; a construction ghost follows the selected tile and admission remains authoritative. A route preview shows its numbered corners. Facilities are selectable both on the map and through full-width workshop buttons with names and status. Couriers also have text-labeled crew controls. The inspector shows recipe, stored items, missing bill, and work or waiting state in ordinary text.

**The Evidence Rule.** Only Rust-derived state may change a machine's work marker, cargo label, construction state, or production count. Decorative terrain does not imply a resource or route.

Save/import controls, current-world handoff, legacy-world notice, errors, and loading states use the shared shell. A saved revision and a historical replay tick remain visually distinguishable. Appearance, decorative art, selection, and camera state never enter simulation identity. The older observatory remains available for actual data-derived portraits, truth maps, circuits, and recorded journeys.

## Do's and Don'ts

### Do:

- Do preserve the shared palette bindings, installed typefaces, appearance control, and keyboard focus.
- Do use the original atlas and its measured crop rectangles for the frontier's machines, couriers, resources, and scrub.
- Do keep the scene dominant and the workshop available without shrinking the whole world to phone width.
- Do pair machine colors and animation with written status, cargo labels, or selection outlines.
- Do preserve the screen-size floors for world annotations and keep informative homepage labels outside the scaling artwork.
- Do preserve the reading and laboratory layouts outside the scoped frontier surface.
- Do keep generation provenance embedded in shipping raster metadata and preserve native alpha.

### Don't:

- Don't restore the superseded green-only palette, Arial body type, or abstract-shape frontier as current design defaults.
- Don't invent simulation outcomes through animation, labels, terrain decoration, or agent narration.
- Don't let the game's fixed earth colors override semantic text and control colors in the shared shell.
- Don't spread the marketing wall treatment or header blur into reading planes and machine inspectors.
- Don't remove accessible list selection or keyboard camera controls when refining map interactions.
