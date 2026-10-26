import type { Metadata, Viewport } from "next";
import { Inter, Lexend } from "next/font/google";
import { Providers } from "@/components/providers";
import { THEME_COLORS } from "@/lib/theme";
import { READING_BOOT } from "@/lib/reading";
// KaTeX styles in the global stylesheet, on every page: without them each
// formula shows twice and out of order ("246100100246" for 246/100), and a
// stylesheet that only arrives with the chat's chunks can be late or missing
// (a cached app shell after a deploy).
import "katex/dist/katex.min.css";
import "./globals.css";
// Claude Design: the system stack (SF Pro on Apple) with Inter everywhere
// else. The font variables live on <html> so --font-stack, defined on :root,
// can resolve them (on <body> the stack was invalid and every non-Apple device
// fell back to its default font, e.g. Roboto on Android).
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});
// Huge headlines (.hero-title) in Inter 800 italic, like Carlos's style
// references (decision of 17/10/2026). Not preloaded: the browser downloads it
// only when a page shows a .hero-title.
const interHero = Inter({
  subsets: ["latin", "latin-ext"],
  weight: "800",
  style: "italic",
  variable: "--font-hero",
  display: "swap",
  preload: false,
});
// Easy-reading option in Ajustes (dyslexia-friendly). Downloaded only on use.
const lexend = Lexend({
  subsets: ["latin", "latin-ext"],
  variable: "--font-lexend",
  display: "swap",
  preload: false,
});
export const metadata: Metadata = {
  title: { default: "Dream — Tu compañero de estudio", template: "%s · Dream" },
  description:
    "Dream te ayuda a entender lo que estudias: pregunta, sube tus apuntes y practica con tests.",
  applicationName: "Dream",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dream",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  other: {
    "mobile-web-app-capable": "yes",
    "supported-color-schemes": "light dark",
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${interHero.variable} ${lexend.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('dream-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}" +
              READING_BOOT,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
