import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { Orb } from "@/components/orb";
import { CookieSettingsButton } from "@/components/cookie-settings-button";

const LINKS = [
  { href: "/sobre-nosotros", label: "Sobre nosotros" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos" },
  { href: "/cookies", label: "Cookies" },
  { href: "/aviso-legal", label: "Aviso legal" },
];

export function LegalPage({ content, children }: { content: string; children?: React.ReactNode }) {
  return (
    <main className="legal-page">
      <header className="legal-head">
        <Link className="legal-brand press" href="/" aria-label="Dream, inicio">
          <Orb size={24} /> Dream
        </Link>
        <nav aria-label="Documentos legales">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <article className="legal-body">
        <Markdown content={content} />
        {children}
      </article>
      <footer className="legal-foot">
        <CookieSettingsButton />
      </footer>
    </main>
  );
}
