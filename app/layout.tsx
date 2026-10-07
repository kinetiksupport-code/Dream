import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";
import "katex/dist/katex.min.css";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
export const metadata: Metadata = {
  title: { default: "Dream — Tu espacio para pensar", template: "%s · Dream" },
  description: "Una inteligencia personal para aprender, crear y entender.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Dream" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F1E9" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0F10" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('dream-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}",
          }}
        />
      </head>
      <body className={`${inter.variable} ${mono.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
