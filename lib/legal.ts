// Public legal pages. Shared by the middleware (maintenance allowlist), the
// footers and Ajustes so every link points to the same four routes.
export const LEGAL_LINKS = [
  { href: "/privacidad", label: "Privacidad", title: "Política de privacidad" },
  { href: "/terminos", label: "Términos", title: "Términos y condiciones" },
  { href: "/cookies", label: "Cookies", title: "Almacenamiento y cookies" },
  { href: "/aviso-legal", label: "Aviso legal", title: "Aviso legal" },
] as const;

export type LegalRoute = (typeof LEGAL_LINKS)[number]["href"];

export const LEGAL_ROUTES: ReadonlySet<string> = new Set(
  LEGAL_LINKS.map((link) => link.href),
);

export function isLegalRoute(pathname: string | null | undefined): boolean {
  return !!pathname && LEGAL_ROUTES.has(pathname);
}

/** Local flag: the first-visit storage notice was closed. Not personal data. */
export const STORAGE_NOTICE_KEY = "dream-storage-notice-v1";

/** EU AI Act, art. 50: shown next to the chat composer from the first message. */
export const AI_NOTICE =
  "Estás hablando con una IA. Puede equivocarse: contrasta lo importante.";
