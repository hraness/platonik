import { paletteColors } from "@hraness/design-kit";

// Use the shared Catppuccin colors before hydration, including when JavaScript is
// unavailable. The shared controller takes over once it sets data-theme.
const declarations = (mode: "light" | "dark") => Object.entries(paletteColors.catppuccin[mode])
  .map(([key, value]) => `--hraness-palette-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}:${value}`)
  .join(";");

export const appearanceFallback = `:root:not([data-theme]){color-scheme:light;${declarations("light")}}@media(prefers-color-scheme:dark){:root:not([data-theme]){color-scheme:dark;${declarations("dark")}}}`;

export function rgbChannels(hex: string): readonly [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Expected an opaque shared palette color.");
  return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}
