# Frontier industry atlas

Original game artwork for Platonik, generated on 2026-09-19 with the built-in OpenAI image generation tool. No reference images or existing game assets were used.

The original native RGBA pixel data is preserved without resampling, background removal, or retouching. The exact generation prompt is also embedded in the PNG as text metadata using Impeccable; pixel-bearing PNG chunks remain byte-identical to the generated original. Dimensions: 1448 × 1086 pixels. Alpha inspection found 54.8% fully transparent pixels; the object interiors are near-opaque. The generation requested a regular grid, but some subjects extend beyond nominal cells. The measured padded source rectangles in `atlas.json` are authoritative. Each rectangle's anchor is its approximate local ground-contact point.

Render with nearest-neighbor sampling when appropriate, while keeping the detailed machine silhouettes readable. The art is decorative; facility identity, selection, and production status must remain available in accessible text and controls.

## Generation prompt

Use case: stylized-concept.
Asset type: transparent game sprite atlas for the playable browser factory world Platonik.
Primary request: Create one production-ready sprite sheet with EXACTLY 12 individually isolated pixel-art sprites arranged in a strict regular grid of 4 columns and 3 rows, on a genuinely transparent alpha background. The whole image is 1536 pixels wide by 1152 pixels tall, every cell exactly 384 by 384 pixels. Every object is centered inside its cell, fits inside a 300 by 300 pixel safe area, has a consistent ground-contact baseline 310 pixels down its cell, and never crosses cell edges. No cell dividers, labels, letters, numbers, UI, backdrop, or contact-sheet frame. Do not draw transparency checkerboard.

The row-major cell subjects, each unique, are:
Row 1 column 1: compact rotary mining drill, thick teal chassis, copper auger aimed into ground, exposed warm brass gears and ore chute.
Row 1 column 2: squat ore smelter/fabricator with glowing orange furnace aperture, ribbed chimney, copper vent pipes and strong iron base.
Row 1 column 3: mechanical assembler workshop, teal paired tool arms above a small assembly table, brass rollers, visible tiny structural frame being made.
Row 1 column 4: rugged low storehouse, broad corrugated oxidized teal roof, warm wood/copper crates stacked by its open door.
Row 2 column 1: short industrial crane, brass articulated boom over its teal turntable pedestal, dangling mechanical grab, broad stable base.
Row 2 column 2: frontier outpost home, compact sand-colored mobile hab hut, teal metal roof, amber circular window, tiny dish and front steps.
Row 2 column 3: slender survey beacon tower, warm amber lantern at top, three sturdy teal support legs, cable coil at base.
Row 2 column 4: heavy foundry, two glowing orange crucibles and a dark chimney, large copper pipes and angular teal casing.
Row 3 column 1: appealing tiny autonomous courier rover, four stout wheels, teal shell, small warm yellow headlamp eyes, copper cargo basket; machine not animal, pointing lower right.
Row 3 column 2: naturally irregular cluster of ochre iron ore rocks with rusty copper seams, rough facets and several smaller chips.
Row 3 column 3: cluster of small luminous amber spark crystals growing from dark stones, warm honey glow kept very close to crystals.
Row 3 column 4: dry alien frontier vegetation, sage green spiky scrub with two small ochre stones, delicate restrained silhouette.

Style: meticulously hand-crafted high-quality pixel art, crisp visible pixel clusters, limited warm sand / oxidized teal / aged copper / charcoal palette, lightly worn machinery with tangible materials and strongly distinct readable silhouettes. Premium independent automation game, personable practical frontier industry. Orthographic three-quarter top-down view, camera about 55 degrees above horizontal, identical projection for all sprites, no extreme diamond-isometric floor tiles. Lighting uniformly upper left, small tight cast shadow only immediately beneath each object and still contained in safe area. All buildings similarly scaled. Each sprite should read when displayed at 70 to 110 pixels across. Keep interior details grouped and high contrast. Groundless sprites, real native alpha outside every object. No large surrounding dirt platforms, no scenery behind objects. No copy of any existing game's assets.
