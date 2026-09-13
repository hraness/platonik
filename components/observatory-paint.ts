"use client";

import { paletteColors } from "@hraness/design-kit";
import { useDesignPalette } from "@hraness/design-kit/react";

// Paint changes repaint canvases; simulation inputs and memoized results stay
// independent of appearance. SVGs use the matching semantic CSS variables.
export function useObservatoryPaint() {
  const appearance = useDesignPalette();
  return paletteColors[appearance?.preference.palette ?? "paper"][appearance?.resolvedMode ?? "light"];
}
