import { ImageResponse } from "next/og";

export const alt = "Platonik. Make a creature. See what it becomes. A game in design.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(<div style={{ background: "#f9f9f6", color: "#262c28", width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "64px 80px", justifyContent: "space-between" }}><div style={{ fontSize: 32 }}>platonik.</div><div style={{ display: "flex", flexDirection: "column", fontSize: 78, letterSpacing: "-3px", lineHeight: 1.08 }}><div>Make a creature.</div><div>See what it becomes.</div></div><div style={{ display: "flex", fontSize: 25, color: "#526057" }}>Build little creatures with your AI · A game in design · platonik.space</div></div>, size);
}
