import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { documents } from "@/lib/docs";

export default function sitemap(): MetadataRoute.Sitemap { return ["", "/lab", "/lab/bridge", "/lab/habitat", "/lab/navigation", "/lab/construction", "/lab/answer", "/lab/ark", "/lab/ports", "/docs", ...documents.map(({ slug }) => `/docs/${slug}`)].map((pathname) => ({ url: `${site.url}${pathname}` })); }
