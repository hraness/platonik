import { ImageResponse } from "next/og";

export const alt = "Platonik. Small rules. Unfamiliar life. A game about algorithmic organisms.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(<div style={{ background: "#f9f9f6", color: "#262c28", width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "64px 80px", justifyContent: "space-between" }}><div style={{ fontSize: 32 }}>platonik.</div><div style={{ display: "flex", flexDirection: "column", fontSize: 78, letterSpacing: "-3px", lineHeight: 1.08 }}><div>Small rules.</div><div>Unfamiliar life.</div></div><div style={{ display: "flex", fontSize: 25, color: "#526057" }}>A game about algorithmic organisms · platonik.space</div></div>, size);
}
