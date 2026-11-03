import Link from 'next/link';
import type { ReactNode } from 'react';
import { Orb } from '@/components/orb';
import s from '../blog.module.css';

/** Marco común del blog: cabecera con Dream y «Probar Dream», pie legal. */
export function BlogShell({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={s.page}>
      <a className="skip-link" href="#main">
        Ir al contenido
      </a>
      <header className={s.top}>
        <Link className={`press ${s.brand}`} href="/">
          <Orb size={32} />
          Dream
        </Link>
        <Link className="primary press" href="/login">
          Probar Dream
        </Link>
      </header>
      <main id="main" className={`${s.main} ${narrow ? s.narrow : ''}`}>
        {children}
      </main>
      <footer className={s.footer}>
        <Link href="/blog">Blog</Link>
        <Link href="/privacidad">Privacidad</Link>
        <Link href="/terminos">Términos</Link>
        <Link href="/cookies">Cookies</Link>
        <Link href="/aviso-legal">Aviso legal</Link>
      </footer>
    </div>
  );
}
