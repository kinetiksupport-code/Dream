import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_URL } from "@/lib/seo";
import { blog } from "./blog/lib/blog-client";

// /sitemap.xml: páginas públicas y artículos del blog. Se rehace cada día;
// si la API del blog falla, salen al menos las páginas públicas.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = PUBLIC_PAGES.map((p) => ({
    url: `${SITE_URL}${p.path === "/" ? "" : p.path}`,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
  const articles = await blog.getSitemapEntries().catch(() => []);
  return [
    ...pages,
    ...articles.map((a) => ({
      url: `${SITE_URL}/blog/${a.slug}`,
      lastModified: a.updated_at || a.published_at || undefined,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
