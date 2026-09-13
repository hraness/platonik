"use client";

import { DesignPaletteProvider, ThemeMenuButton } from "@hraness/design-kit/react";
import type { ReactNode } from "react";

export function AppearanceProvider({ children }: { children: ReactNode }) {
  return <DesignPaletteProvider defaultPreference={{ palette: "paper", mode: "system" }}>{children}</DesignPaletteProvider>;
}

export function AppearanceControl() {
  return <ThemeMenuButton className="site-appearance" />;
}
