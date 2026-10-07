import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dream",
    short_name: "Dream",
    description: "Tu espacio personal para aprender, crear y entender.",
    lang: "es",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    background_color: "#F4F1E9",
    theme_color: "#F4F1E9",
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
  };
}
