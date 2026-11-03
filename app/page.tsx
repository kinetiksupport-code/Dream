import Link from "next/link";
import {
  BookOpenCheck,
  CalendarClock,
  Camera,
  GraduationCap,
  Layers,
  ListChecks,
  MessagesSquare,
  NotebookPen,
  Route,
  Sparkles,
  Timer,
} from "lucide-react";
import { CookieSettingsButton } from "@/components/cookie-settings-button";
import { Orb } from "@/components/orb";
import { OrbLink } from "@/components/orb-link";
import { LandingHeader } from "@/components/landing/landing-header";
import { InstallButton } from "@/components/landing/install-button";
import { encodeQr, qrPath } from "@/lib/qr";
import type { Metadata } from "next";
import { HOME_DESCRIPTION, HOME_TITLE, SITE_URL, homeJsonLd, jsonLdScript } from "@/lib/seo";
import s from "./landing.module.css";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/`,
    siteName: "Dream",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    locale: "es_ES",
    images: [{ url: `${SITE_URL}/icon-512.png`, width: 512, height: 512, alt: "Dream" }],
  },
};

// Landing de Dream design (skill dream-design-system, 3-nov-2026). Componente
// de servidor; las islas cliente son la cabecera (scroll y menú), OrbLink (la
// Orb viaja al login) y el botón de instalar. El único momento atrevido es la
// banda de texto en perspectiva, con animation-timeline y @supports; sin
// soporte o con movimiento reducido se ve quieta.

const SITE = "https://www.edudream.es/login";

const CHIPS = [
  { icon: GraduationCap, label: "PAU", color: "var(--dd-blue-ink)" },
  { icon: BookOpenCheck, label: "ESO y Bachillerato", color: "var(--dd-green)" },
  { icon: Camera, label: "Tus apuntes", color: "var(--dd-orange)" },
  { icon: Route, label: "Ruta de estudio", color: "var(--dd-blue)" },
  { icon: ListChecks, label: "Tests", color: "var(--dd-pink)" },
  { icon: Timer, label: "Simulacros", color: "var(--dd-green)" },
  { icon: Layers, label: "Tarjetas de repaso", color: "var(--dd-orange)" },
];

const CARDS = [
  {
    title: "Sube tus apuntes",
    text: "Hazles una foto o súbelos desde el móvil con un QR.",
    icon: Camera,
    mock: ["Tema 4 · La célula", "Foto 1 de 3", "Leyendo tus apuntes…"],
  },
  {
    title: "Tu ruta de estudio",
    text: "Dream ordena tus apuntes y tu fecha en lecciones cortas.",
    icon: Route,
    mock: ["Leer", "Test", "Tarjetas"],
  },
  {
    title: "Entiende, no copies",
    text: "Te da una pista y te pregunta hasta que lo sacas tú.",
    icon: MessagesSquare,
    mock: ["¿Me haces el ejercicio 4?", "Te doy una pista: ¿qué pasa si pasas el 6 al otro lado?"],
  },
  {
    title: "Tests y simulacros",
    text: "Practica con preguntas de tus apuntes y un simulacro final.",
    icon: NotebookPen,
    mock: ["Pregunta 3 de 10", "¿Qué orgánulo produce la energía de la célula?"],
  },
  {
    title: "Repasa a tiempo",
    text: "Tarjetas que vuelven justo cuando estás a punto de olvidarlas.",
    icon: CalendarClock,
    mock: ["Para hoy", "Mitocondria", "Ribosoma"],
  },
];

const STATS = [
  { value: "0 €", label: "Gratis, sin tarjeta" },
  { value: "17", label: "Comunidades autónomas" },
  { value: "3", label: "Etapas: ESO, Bachillerato y PAU" },
  { value: "24 h", label: "Abierto cuando estudias" },
];

const BANDS = [
  { text: "Apuntes · Tests · Ruta · Simulacros · ", tone: "brand" },
  { text: "Entiende · Practica · Repasa · Aprueba · ", tone: "lime" },
  { text: "Saca tu mejor nota · Saca tu mejor nota · ", tone: "green" },
];

const FAQ = [
  {
    q: "¿Dream es gratis?",
    a: "Sí. Entras con tu cuenta de Google y no hace falta tarjeta ni suscripción.",
  },
  {
    q: "¿Dream me hace los deberes?",
    a: "No. Dream no te da el ejercicio resuelto: te da pistas y te pregunta hasta que lo entiendes y lo sacas tú.",
  },
  {
    q: "¿Para qué cursos sirve?",
    a: "Para ESO, Bachillerato y la PAU. Trabaja con tus propios apuntes, así que sigue el temario de tu clase.",
  },
  {
    q: "¿Hay que descargar algo?",
    a: "No. Dream funciona en el navegador. Si quieres, puedes instalarlo en tu móvil como una app desde el propio navegador.",
  },
  {
    q: "¿Qué pasa con mis apuntes?",
    a: "Solo los usa Dream para prepararte el examen. Puedes ver cómo tratamos tus datos en la política de privacidad.",
  },
];

function Cta({ children = "Probar Dream", className = "" }: { children?: string; className?: string }) {
  return (
    <OrbLink className={`primary press ${s.cta} ${className}`} href="/login">
      {children}
    </OrbLink>
  );
}

export default function LandingPage() {
  const qr = encodeQr(SITE);
  const qrSize = qr.size + 8;
  return (
    <div className={s.site}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(homeJsonLd()) }} />
      <a className="skip-link" href="#main">
        Ir al contenido
      </a>
      <LandingHeader />
      <main id="main">
        {/* Hero: panel azul de marca con titular en mayúsculas y la Orb asomando. */}
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroInner}>
            <h1 id="hero-title" className={s.heroTitle}>
              <span>Saca</span> <span>tu mejor</span> <span>nota</span>
            </h1>
            <p className={s.heroLead}>
              Sube tus apuntes, entiende cada tema con pistas y prepárate el examen a tu ritmo.
            </p>
            <div className={s.heroActions}>
              <Cta />
              <span className={s.note}>Gratis. Entra con Google.</span>
            </div>
          </div>
          <span className={s.heroOrb} aria-hidden="true">
            <Orb size={260} breathing />
          </span>
        </section>

        {/* Tira de chips */}
        <section className={s.chipsRow} aria-label="Para quién es Dream">
          <p className={s.chipsLabel}>Hecho para</p>
          <ul className={s.chips}>
            {CHIPS.map((c) => (
              <li key={c.label} className={s.chip}>
                <c.icon size={20} strokeWidth={2.5} aria-hidden="true" style={{ color: c.color }} />
                {c.label}
              </li>
            ))}
          </ul>
        </section>

        {/* Carrusel de tarjetas de cristal azul (la única familia con cristal). */}
        <section className={s.section} id="funciones" aria-labelledby="funciones-title">
          <span className={`${s.stickerIcon} ${s.stickerGreen}`} aria-hidden="true">
            <Sparkles size={34} strokeWidth={2.75} />
          </span>
          <h2 id="funciones-title" className={s.sectionTitle}>
            Todo lo que necesitas para tu examen
          </h2>
          <p className={s.sectionLead}>Desde la foto de tus apuntes hasta el simulacro del último día.</p>
          <div className={s.carouselWrap}>
            <span className={s.blobs} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <ul className={s.carousel} aria-label="Funciones de Dream">
              {CARDS.map((c) => (
                <li key={c.title} className={`glass-card ${s.card}`}>
                  <h3 className={s.cardTitle}>{c.title}</h3>
                  <div className={s.mock} aria-hidden="true">
                    {c.mock.map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                  </div>
                  <p className={s.cardText}>{c.text}</p>
                  <c.icon className={s.cardIcon} size={52} strokeWidth={2.5} aria-hidden="true" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Momento atrevido: bandas de texto en perspectiva con el scroll. */}
        <section className={s.bands} aria-hidden="true">
          {BANDS.map((b) => (
            <div key={b.tone} className={s.band} data-tone={b.tone}>
              <span>{b.text.repeat(3)}</span>
            </div>
          ))}
        </section>

        {/* Cifras reales del producto, nada inventado. */}
        <section className={s.section} id="cifras" aria-labelledby="cifras-title">
          <h2 id="cifras-title" className={s.sectionTitle}>
            Dream en cifras
          </h2>
          <p className={s.sectionLead}>Lo que ya puedes usar hoy.</p>
          <dl className={s.stats}>
            {STATS.map((st) => (
              <div key={st.label} className={s.stat}>
                <dt className={s.statLabel}>{st.label}</dt>
                <dd className={s.statValue}>{st.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Bloque de descarga: Dream es web/PWA. QR para abrirla en el móvil. */}
        <section className={s.download} id="instalar" aria-labelledby="instalar-title">
          <div className={s.downloadCopy}>
            <h2 id="instalar-title" className={s.sectionTitleLeft}>
              Llévate Dream en el móvil
            </h2>
            <p className={s.sectionLeadLeft}>
              Escanea el código con la cámara para abrir Dream en tu móvil. Luego puedes instalarlo como una app.
            </p>
            <div className={s.downloadActions}>
              <InstallButton className={`${s.install} press`} />
            </div>
          </div>
          <figure className={s.qr}>
            <svg viewBox={`0 0 ${qrSize} ${qrSize}`} role="img" aria-label="Código QR para abrir Dream en el móvil" shapeRendering="crispEdges">
              <path d={qrPath(qr)} fill="#0a0c19" />
            </svg>
          </figure>
        </section>

        {/* FAQ: acordeón con details/summary; el + rota a ×. */}
        <section className={s.section} id="preguntas" aria-labelledby="preguntas-title">
          <h2 id="preguntas-title" className={s.sectionTitle}>
            Preguntas frecuentes
          </h2>
          <div className={s.faq}>
            {FAQ.map((f) => (
              <details key={f.q} className={s.faqItem}>
                <summary>
                  <span>{f.q}</span>
                  <span className={s.plus} aria-hidden="true" />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
          <Cta className={s.faqCta} />
        </section>
      </main>
      <footer className={s.footer}>
        <div className={s.footerTop}>
          <p className={s.footerBrand}>
            <Orb size={28} /> Dream © 2026
          </p>
          <nav aria-label="Legal" className={s.footerLinks}>
            {/* Carga completa: /blog tiene su propia CSP de imágenes (lib/csp.ts). */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/blog">Blog</a>
            <Link href="/privacidad">Privacidad</Link>
            <Link href="/terminos">Términos</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/aviso-legal">Aviso legal</Link>
            <CookieSettingsButton className={s.footerButton} />
          </nav>
        </div>
        <p className={s.giant} aria-hidden="true">
          Dream
        </p>
      </footer>
    </div>
  );
}
