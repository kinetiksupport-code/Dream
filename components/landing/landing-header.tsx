"use client";
// Cabecera flotante de la landing (skill dream-design-system): logo completo
// arriba; al bajar se queda solo el icono y aparece «Empezar». Botón circular
// de menú con un panel oscuro que escala desde el disparador (0.97 → 1).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Orb } from "../orb";
import { OrbLink } from "../orb-link";
import s from "./landing-header.module.css";

const LINKS = [
  { href: "#funciones", label: "Qué hace Dream" },
  { href: "#cifras", label: "Dream en cifras" },
  { href: "#instalar", label: "Instalar Dream" },
  { href: "#preguntas", label: "Preguntas frecuentes" },
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <header className={s.header} data-scrolled={scrolled || undefined}>
      <Link className={`press ${s.brand}`} href="/" aria-label="Dream">
        <Orb size={36} />
        <span className={s.word} aria-hidden="true">
          Dream
        </span>
      </Link>
      <div className={s.right}>
        <OrbLink className={`press ${s.enter}`} href="/login">
          Entrar
        </OrbLink>
        <OrbLink className={`primary press ${s.start}`} href="/login" tabIndex={scrolled ? undefined : -1} aria-hidden={!scrolled || undefined}>
          Empezar
        </OrbLink>
        <button
          ref={button}
          type="button"
          className={`round-button press ${s.menuButton}`}
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>
      <div ref={panel} id="landing-menu" className={`glass-float ${s.panel}`} data-open={open || undefined} hidden={!open}>
        <nav aria-label="Secciones">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={s.panelLink} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
