---
name: Platonik
description: Minimal typography and labeled diagrams for the Platonik website and documentation.
colors:
  paper: "#f9f9f6"
  ink: "#262c28"
  muted: "#616a63"
  accent: "#304f3d"
  line: "#d9ddd5"
  wash: "#edf0e9"
  selection: "#d6e3ce"
  accent-hover: "#213d2c"
  accent-hover-text: "white"
  policy-a-fill: "#e2e9dc"
  policy-a-border: "#849981"
  policy-b-fill: "#f1e9dc"
  policy-b-border: "#b6a184"
  wounded-border: "#7a6255"
  wound-mark: "#765445"
typography:
  display:
    fontFamily: 'Newsreader, Georgia, "Times New Roman", serif'
    fontSize: "clamp(56px, 6.3vw, 82px)"
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: "-.04em"
  headline:
    fontFamily: 'Newsreader, Georgia, "Times New Roman", serif'
    fontSize: "clamp(36px, 4.5vw, 52px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-.035em"
  section-title:
    fontFamily: 'Newsreader, Georgia, "Times New Roman", serif'
    fontSize: "35px"
    fontWeight: 400
    lineHeight: 1.22
    letterSpacing: "-.025em"
  prose-heading:
    fontFamily: 'Newsreader, Georgia, "Times New Roman", serif'
    fontSize: "29px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-.02em"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.65
  prose:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.75
rounded:
  inline: "2px"
  surface: "3px"
  cell-mobile: "5px"
  cell: "8px"
spacing:
  paragraph: "18px"
  group: "24px"
  figure: "30px"
  hero-copy: "32px"
  gutter-wide: "44px"
  gutter-tablet: "28px"
  gutter-mobile: "22px"
components:
  primary-link:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.surface}"
    padding: "12px 18px"
  primary-link-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.accent-hover-text}"
  text-link:
    textColor: "{colors.accent}"
    typography: "{typography.label}"
  navigation-link:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "12px 0"
  documentation-link:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    padding: "7px 0"
  policy-a-cell:
    backgroundColor: "{colors.policy-a-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.cell}"
    width: "64px"
  policy-b-cell:
    backgroundColor: "{colors.policy-b-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.cell}"
    width: "64px"
  wounded-cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.cell}"
    width: "64px"
  conversation-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "18px 0"
  code-block:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.surface}"
    padding: "22px"
---

# Design System: Platonik

## Shared appearance and observatory

All routes now use the shared design-kit palette and appearance menu. Paper
with System appearance is the initial preference; the menu is the final header
action and offers the shared palettes plus Light, Dark, and System. Without
JavaScript, the initial Paper palette follows the operating system. Preference
persistence, system changes, menu keyboard behavior, and browser theme color
belong to the shared provider and control.

The observatory is an Operate surface. Nebula Sans supports compact controls and
readable measurements; Newsreader remains the heading voice. Reading planes are
opaque, inputs use the shared inset edge, and selected experiments, views, and
lineages use Lantern's warm plane. Rich glass is limited to the sticky header.
The eight recorded Rust studies are grouped in one labeled disclosure before
the four browser experiment tabs, keeping the working bench close to arrival.

SVG and canvas diagrams use the shared semantic palette. Structural portraits
retain their rule-derived geometry and memory-dependent tint; truth maps retain
their exact crossing counts and bounded domain. The map legend describes the
current palette's early/late colors. Appearance never enters the simulation,
saved collection, recorded Rust data, playback, or work calculations.

This section supersedes the light-only colors and Arial body type in the
original laboratory/documentation record below. The immutable Lantern and
marketing bundles remain independently checked under `vendor/`.

## Living world renderer

`/play` is a world-first Operate surface. The map occupies the dominant visual
plane, followed by one compact timeline, a plain-language moment readout, and a
selection inspector. Program editors, challenge grids, scoreboards, and track
pickers do not appear in the primary game. They remain in the archived
`/play/lab` engineering surface.

The renderer uses only Rust-derived experiments, states, frames, and summaries.
Cargo, construction, active cells, walls, source stock, beacon charge, and
selection use the shared semantic palette plus textual labels. Appearance does
not enter the world hash or execution. Pan-by-overflow, playback, scrubbing,
entity selection, file opening, and export do not mutate the world.

The agent handoff is the only primary action. Shared `.lab-button` presentation
must produce the same foreground, hover, focus, target, and text-decoration
behavior on buttons, anchors, and file labels; route-specific CSS may arrange
those controls but must not redefine their state colors.

## Shared marketing surface

The homepage now uses Hraness's approved Peopleblade marketing treatment: Instrument Serif 400 display headings, Nebula Sans body text, a restrained continuous gradient with faint grain and cell seams, and more open spacing. The shared preset and its font, texture, license, and validation files live in `vendor/hraness-marketing`; keep that immutable bundle intact and adapt through `app/marketing.css`.

This is a Persuade surface. Keep the existing product claims, proposal labels, concept diagram, conversation, and routes. The homepage title uses the shared 44–64px scale, section titles use 38.4–52px, and supporting copy remains 16–17px. The gradient belongs behind the opening story, with an opaque surface beneath the labeled concept diagram.

The public header uses compact Nebula Sans, a 72px minimum height, and the shared blur with an opaque accessibility fallback. Skip-link stacking, document anchor clearance, and sidebar offsets account for this sticky header. Documentation and the observatory retain the reading and operating styles recorded below; their controls, evidence, and diagrams do not inherit homepage display styling.

The following original design record continues to describe those documentation and laboratory surfaces. Its homepage-specific values are superseded by this shared marketing scope.

## Overview

**Creative North Star: "Minimal styling"**

The website uses an off-white page, dark text, serif headings, and restrained green links. Hierarchy comes from type size, reading width, whitespace, and fine dividers. The user requested minimal styling; this record describes the resulting implementation rather than a new visual direction.

The layout stays flat. Small labeled diagrams explain the game concept, and documentation uses the same type and palette as the homepage. There are no decorative animations, gradients, or shadows in the current implementation.

Captured from [the global stylesheet](app/globals.css), [the page shell](app/layout.tsx), [the homepage](app/page.tsx), and [documentation components](components/markdown.tsx). The saved desktop and mobile review captures were inspected alongside the source. Values in frontmatter describe the default viewport; responsive overrides appear below. This is a website design record, not a design system for the proposed Rust game.

**Key Characteristics:**

- Off-white background with dark text and muted supporting copy.
- Newsreader headings paired with Arial body text.
- Flat sections separated by thin rules and generous spacing.
- Diagrams use labels and marks alongside color.
- Immediate hover and focus feedback, with no animated transitions.

## Colors

The core palette comes from the six custom properties in the global stylesheet. Additional colors describe existing selection, link-hover, and cell-diagram states.

### Primary

`accent` is the dark green used for the primary link background, text links, prose links, the wordmark period, and keyboard focus outlines. `accent-hover` darkens the primary link on hover, paired with `accent-hover-text`.

### Neutral

`paper` covers the page and primary-link text. `ink` is the main text color; `muted` serves descriptions, secondary navigation, captions, and status notes. `line` draws section dividers, table rules, and list boundaries. `wash` supplies the quiet background behind quotations and code. `selection` marks selected text while retaining ink-colored characters.

### Diagram states

The two policy fills and borders distinguish A and B cells. These are diagram-specific categories, not general interface status colors. A disabled controller uses the paper background, a dashed `wounded-border`, and a `wound-mark` cross. The letters, cross, caption, and accessible description carry the same information as the color treatments.

## Typography

Newsreader regular is loaded from the local font package in the root layout. Georgia and Times New Roman are the serif fallbacks. Arial, Helvetica, and sans-serif serve body text and controls. Code uses the platform monospace stack recorded in the tokens.

The display role belongs to the homepage headline; headline belongs to document titles. Section-title describes homepage section headings, while prose-heading describes document section headings. Body text is airy; document prose uses a smaller size with more leading. Headings use balanced wrapping, paragraphs use pretty wrapping, and document prose permits long words to break.

The wordmark is lowercase Newsreader with a green period (29px, line height 1, letter spacing -.04em). The homepage introduction uses larger sans-serif text (24px, line height 1.5). Status notes and figure notes use smaller muted text (12px); navigation and ordinary link labels use the label role. Document bold text and the active navigation entry use weight 600.

At widths up to 480px, the body becomes 16px, document prose 15px, homepage headline 57px, document title 38px, homepage section heading 31px, and document section heading 27px. The wordmark becomes 26px and the homepage introduction becomes 21px. These are existing overrides, not a generated type scale.

## Layout

The header and documentation shell share a maximum width of 1160px. Their wide-screen horizontal gutter uses `gutter-wide`. The site footer is the shared `@hraness/site-footer` package in document flow; it owns its own layout, the “Built by Hraness” organization attribution, network links, and responsive behavior, and this site adds no second footer bar. The centered homepage is at most 900px wide, with a hero capped at 780px. Supporting hero text remains within 590px. Ordinary homepage paragraphs may span 70ch; conversation text is capped at 60ch.

The desktop documentation layout has a 190px navigation column, a 60px gap, and a content column capped at 740px. Its sidebar is sticky, 32px from the top. Split homepage sections use a 260px heading column and a 54px gap. The initial hero has 64px top and 76px bottom padding; subsequent homepage sections use 52px top and 56px bottom padding.

At widths up to 800px, the gutters become `gutter-tablet`, split sections stack, and documentation switches to a single column. The documentation navigation becomes a wrapping horizontal row between rules; it is no longer sticky.

At widths up to 480px, gutters become `gutter-mobile`. Hero links stack, chapter labels sit above descriptions, and section spacing tightens. The conversation speaker column shrinks from 64px to 42px. Tables and code blocks scroll within their own containers; tables retain their 560px minimum width. The table region is keyboard-focusable.

## Elevation & Depth

There are no box shadows or elevation tokens. Whitespace and fine borders distinguish sections; the wash surface groups code and quotations. Hover states change color or underline immediately. No animation or transition durations are defined. The reduced-motion rule retains automatic scrolling.

## Shapes

The page consists of open rectangular sections. Primary links, code blocks, and quotations use the subtle surface radius. Inline code and focus outlines use the smaller inline radius. Cell diagrams use larger corners, with the observed mobile radius at narrow widths.

Dividers are one-pixel solid lines. Cell borders use policy-specific colors; the disabled cell switches to a dashed border. Cells are square, with values centered and policy labels at the bottom. Small plain arrow characters accompany navigational links; they are hidden from assistive technology when decorative.

## Components

### Primary and text links

The primary action is an anchor styled as a compact green rectangle. It uses the primary-link tokens, an arrow separated by a 24px gap, and no underline. Hover uses the recorded darker state. Text links remain green and underlined; ordinary links inherit their surrounding text color and become green on hover.

Links and keyboard-focusable regions receive a two-pixel green outline with a five-pixel offset. There are no distinct pressed, loading, or disabled variants in the current site. The top-level skip link becomes visible when focused and moves directly to the main content.

### Navigation

The header pairs the wordmark with two text links. Its default navigation gap is 29px. Header links are unadorned at rest and underlined on hover. Documentation navigation uses muted links; the current page is dark and weight 600, exposed with `aria-current="page"`. It changes layout at the documented breakpoint without adding a menu overlay.

### Documentation rows and prose

The documentation index presents full-width linked rows separated by rules. Each row has a serif heading and arrow, a question, and a muted description; hovering underlines the heading. These are linked reading rows, without separate card surfaces or shadows.

Document headings, paragraphs, lists, quotations, code, and comparison tables share the prose rhythm. Code blocks use the wash surface, monospace text, and horizontal overflow; their padding reduces to 16px at the narrow breakpoint. Quotations use the same wash without a decorative left border. Table headings and cells are left-aligned and separated by horizontal rules.

### Cell diagram

Eight numbered cells form a static row, with A/B policy labels and one disabled-controller cross. The row uses a ten-pixel gap on wide screens and six pixels on mobile. Mobile cell width is calculated from the available row width so all eight fit. A single accessible description explains values, policies, and the disabled cell; visual child elements are hidden from assistive technology to avoid duplicate readings. The caption explicitly identifies the figure as a concept illustration.

### Conversation and chapters

Conversation entries place a small semibold speaker label beside a paragraph, with fine horizontal rules between turns. They are illustrative text, without message bubbles, avatars, or interactive chat controls. Chapter rows similarly separate a concise label from its description and stack those fields on narrow screens.

The sidecar contains standalone examples of the primary link, header navigation, documentation navigation, cell diagram, conversation, and code block. These reproduce existing patterns; the website has no input fields, chips, dialogs, or game controls to document.

## Do's and Don'ts

### Do:

- Do preserve the off-white page, dark text, green accent, and fine dividers.
- Do use Newsreader regular for large headings and Arial for body text and navigation.
- Do retain visible keyboard focus and the skip link.
- Do label diagram categories and disabled controllers with text or marks as well as color.
- Do keep wide code and tables scrollable within the reading column.
- Do identify concept illustrations and illustrative conversation as proposals.

### Don't:

- Don't add decorative motion, shadows, or gradients when extending this minimally styled surface.
- Keep the campaign illustrations labeled as proposals; the observatory's interactive controls belong to its separate browser models.
- Don't rely on color alone to convey policy or controller state.
- Don't describe this captured website system as an implemented game interface.

## Observatory extension

The user requested interactive prototypes and abstract microscope-like algorithm portraits. The `/lab` surface inherits the paper, ink, Newsreader, fine dividers, and minimal styling of the reading site. Its mode is Operate: choose a program, inspect a computed form or replay, compare a variation, and keep or export a specimen. Four keyboard-operable tabs separate specimens, truth landscapes, world budgets, and the Autoverse signal workbench. Tabs wrap on narrow screens.

The desktop bench places a large computed artifact beside its controls; mobile stacks the artifact and controls. The artifact supplies visual interest through actual data: summed rule fields form a membrane-like portrait, exact trajectories draw journeys, and threshold counts color truth maps. Those fields are visualization encodings rather than decorative backgrounds. Portraits are static; motion occurs only during an explicitly requested bounded replay. The specimen drawer is an open collection of thumbnails and names separated by rules.

Inputs, buttons, selectors, and expandable editors use the existing paper/wash surfaces, green action color, and visible focus outlines. Errors use a dark warm tone with text. Disabled actions remain labeled. Tab changes and control feedback are immediate, with no decorative transitions. The observation legend and numeric/text results accompany visual encodings so appearance never carries the only explanation.

The Autoverse workbench extends these same open sections. Its circuit drawing encodes actual nodes, connections, and binary states; the layout is a diagram, not physical distance. A selected trace step and text outputs accompany it. Capability checks and construction results report finite model evidence without turning the proposed campaign into a fake completion meter.
