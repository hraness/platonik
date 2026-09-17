import { site } from "./site";

/**
 * Structured data for public pages. Every field restates visible content: the
 * site name, description, and routes a reader can already see, plus the
 * "Built by Hraness" organization the shared footer shows on every page.
 */
export const hranessOrganization = {
  "@type": "Organization",
  name: "Hraness",
  url: "https://hraness.com",
} as const;

/** Site-wide graph rendered once in the root layout. */
export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    hranessOrganization,
    {
      "@type": "WebSite",
      url: site.url,
      name: site.name,
      description: site.description,
      publisher: hranessOrganization,
    },
  ],
} as const;

/**
 * The game the homepage presents. The description keeps its honest "a game in
 * design" status; no release date, rating, or platform is claimed.
 */
export const videoGameJsonLd = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: site.name,
  url: site.url,
  description: site.description,
  author: hranessOrganization,
} as const;

/** One field-guide document's headline and description as a technical article. */
export function techArticleJsonLd(document: { slug: string; title: string; description: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: document.title,
    description: document.description,
    url: `${site.url}/docs/${document.slug}`,
    author: hranessOrganization,
    isPartOf: { "@type": "WebSite", name: site.name, url: site.url },
  } as const;
}
