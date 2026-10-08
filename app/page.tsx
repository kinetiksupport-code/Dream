"use client";
import Link from "next/link";
import { useEffect } from "react";
import { ArrowRight, Check, Search, FileText } from "lucide-react";
import { DreamSiteMark } from "@/components/dream-site-mark";
import s from "./landing.module.css";

export default function LandingPage() {
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((x) => x.classList.add(s.visible)); return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add(s.visible); observer.unobserve(entry.target); }
      });
    }, { threshold: .08 });
    nodes.forEach((x) => observer.observe(x));
    return () => observer.disconnect();
  }, []);
  return <div className={s.site}>
    <nav className={s.nav} aria-label="Navegación pública">
      <Link className={s.brand} href="/"><DreamSiteMark size={26}/>dream</Link>
      <Link className={s.navButton} href="/login">Probar Dream</Link>
    </nav>
    <main>
      <section className={s.hero}>
        <div className={s.gridBackground}/>
        <div className={s.heroGlow}/>
        <div className={s.heroContent}>
          <h1 data-reveal className={s.heroTitle}><span className={s.grey}>No es magia.</span><span>Es tu mente</span><span className={s.lime}>amplificada.</span></h1>
          <p data-reveal className={s.heroCopy}>Aprende, pregunta, investiga y trabaja con tus propios archivos. Dream no está aquí para pensar por ti, sino para ayudarte a entender mejor.</p>
          <Link data-reveal href="/login" className={s.cta}>Probar Dream <ArrowRight size={24}/></Link>
        </div>
      </section>
      <section className={s.narrative}>
        <div data-reveal><p>Obtener una respuesta es fácil.</p><strong>Entenderla es otra cosa.</strong></div>
        <div data-reveal><p>Dream no quiere sustituir tu forma de pensar.</p><strong>Quiere hacerla más potente.</strong></div>
      </section>
      <section className={s.bento} aria-label="Funciones de Dream">
        <article data-reveal className={s.learnCard}>
          <div><h2>Entiende, no memorices.</h2><p>Dream adapta la explicación a lo que necesitas y avanza contigo, paso a paso, sin soltarte una respuesta enorme y desaparecer.</p></div>
          <div className={s.chatDemo}><p className={s.student}>No entiendo por qué aquí cambia el signo.</p><p className={s.wait}>● &nbsp; Pensando...</p><div className={s.dreamReply}>Vamos solo a esa parte. ¿Qué ocurre cuando pasamos un término al otro lado de la ecuación?<div className={s.math}>2x − 4 = 10 → 2x = 10 + 4</div></div></div>
        </article>
        <article data-reveal className={s.fileCard}>
          <div><h2>Tráelo a Dream.</h2><p>PDF, Word, Excel, apuntes o código. Súbelo y pregunta.</p></div>
          <div className={s.filesArt}><span>PDF</span><span>DOC</span></div>
        </article>
        <article data-reveal className={s.testCard}>
          <div><h2>No solo lo leas. Pruébalo.</h2><p>Dream convierte lo que estudias en tests interactivos.</p></div>
          <div className={s.quizDemo}><strong>¿Cuál es el resultado correcto?</strong><p>□ &nbsp; Opción A</p><p className={s.correct}><Check size={17}/> Opción B (Correcta)</p></div>
        </article>
        <article data-reveal className={s.searchCard}>
          <div><h2>Cuando importa, busca.</h2><p>Si una respuesta depende de información reciente, Dream consulta la web antes de responder.</p></div>
          <div className={s.searchDemo}><p><Search size={19}/> Buscando en la web...</p><span>Fuentes para comprobar la respuesta</span></div>
        </article>
      </section>
      <section data-reveal className={s.cinematic}><p>No se trata de tener la respuesta.</p><h2>Se trata de entenderla.</h2></section>
      <section className={s.pricing}>
        <p data-reveal>Aprender mejor no debería depender<br/>de cuánto puedas pagar.</p>
        <h2 data-reveal>Por eso Dream empieza de otra manera.</h2>
        <strong data-reveal className={s.zero}>0€</strong>
        <h3 data-reveal>Dream es gratis.</h3>
        <p data-reveal>Pregunta. Aprende. Practica. Vuelve mañana.</p>
        <small data-reveal>Queremos que tener una buena herramienta para aprender no dependa de una suscripción.</small>
        <Link href="/login" className={s.cta}>Probar Dream <ArrowRight size={24}/></Link>
        <span className={s.note}>Sin tarjeta. Entra con Google.</span>
      </section>
    </main>
    <footer className={s.footer}><span><DreamSiteMark size={17}/> Dream © 2026</span><div><Link href="/privacidad">Privacidad</Link><Link href="/terminos">Términos</Link></div></footer>
  </div>;
}
