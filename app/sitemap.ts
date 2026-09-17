import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { documents } from "@/lib/docs";
import { labPages } from "@/lib/lab-pages";

export default function sitemap(): MetadataRoute.Sitemap { return ["", "/lab", ...labPages.map(({ path }) => path), "/docs", ...documents.map(({ slug }) => `/docs/${slug}`)].map((pathname) => ({ url: `${site.url}${pathname}` })); }
