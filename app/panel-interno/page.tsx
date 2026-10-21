import type { Metadata } from "next";
import { PanelApp } from "@/components/admin/panel-app";

// Esta página solo se alcanza desde el middleware (la ruta configurada en
// ADMIN_PANEL_PATH). Pedida directamente da el 404 de siempre. Sin caché y sin
// indexar. Lo que enseña lo decide dream-api, no esta página.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PanelPage() {
  return <PanelApp />;
}
