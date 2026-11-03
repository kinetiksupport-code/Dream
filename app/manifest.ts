import type { MetadataRoute } from "next";
import { THEME_COLORS } from "@/lib/theme";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dream",
    short_name: "Dream",
    description:
      "Tu compañero de estudio: pregunta, sube tus apuntes y practica con tests.",
    lang: "es",
    dir: "ltr",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: THEME_COLORS.dark,
    theme_color: THEME_COLORS.dark,
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Nuevo chat",
        short_name: "Chat",
        url: "/chat",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Tareas",
        url: "/tasks",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Apuntes",
        url: "/notes",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
