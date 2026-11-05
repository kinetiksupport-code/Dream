import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// /robots.txt: todo lo público se puede rastrear; la app y las rutas internas
// piden sesión y no aportan nada a un buscador.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/subir", "/chat", "/exams", "/notes", "/tasks", "/settings", "/more", "/dreams", "/esquemas", "/progress", "/tests", "/juegos", "/apuntes", "/reclamar"],
    },
    sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/blog/sitemap.xml`],
    host: SITE_URL,
  };
}
