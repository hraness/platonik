import {
  createSocialImageResponse,
  socialImageContentType,
  socialImageSize,
} from "@hraness/web-discovery/social-image";
import { site } from "@/lib/site";

export const alt = "Platonik. Make a creature. See what it becomes. A game in design.";
export const size = socialImageSize;
export const contentType = socialImageContentType;

function PlatonikMark() {
  return (
    <svg
      aria-label="Platonik tetrahedron mark"
      height="42"
      role="img"
      viewBox="0 0 42 42"
      width="42"
    >
      <path
        d="M21 5 37.5 34 4.5 34Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path
        d="M21 5v20M4.5 34 21 25M37.5 34 21 25"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function Image() {
  return createSocialImageResponse({
    description: site.description,
    domain: new URL(site.url).hostname,
    eyebrow: site.name,
    mark: <PlatonikMark />,
    theme: {
      accent: "#1E5AE1",
      background: "#F8F7F4",
      foreground: "#1C1917",
      muted: "#6C665F",
    },
    title: "Platonik — a world of algorithmic organisms",
  });
}
