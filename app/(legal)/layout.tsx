import Link from "next/link";
import { Orb } from "@/components/orb";
import { LegalLinks } from "@/components/legal-links";
import s from "@/components/legal.module.css";

// Public pages: no session needed, and also reachable in maintenance mode.
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={s.site}>
      <header className={s.nav}>
        <Link className={s.brand} href="/">
          <Orb size={32} />
          Dream
        </Link>
        <Link className={`primary press ${s.navCta}`} href="/login">
          Entrar
        </Link>
      </header>
      <main id="main" className={s.main}>
        {children}
      </main>
      <footer className={s.footer}>
        <span className={s.footerBrand}>
          <Orb size={20} /> Dream © 2026
        </span>
        <LegalLinks className={s.links} />
      </footer>
    </div>
  );
}
