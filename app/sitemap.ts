import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { documents } from "@/lib/docs";
import { labPages } from "@/lib/lab-pages";

export default function sitemap(): MetadataRoute.Sitemap { return [
  { url: `${site.url}/`, priority: 1 },
  { url: `${site.url}/play`, priority: 0.9 },
  { url: `${site.url}/docs`, priority: 0.8 },
  ...labPages.map(({ path }) => ({ url: `${site.url}${path}`, priority: 0.6 })),
  ...documents.map(({ slug }) => ({ url: `${site.url}/docs/${slug}`, priority: 0.6 })),
]; }
