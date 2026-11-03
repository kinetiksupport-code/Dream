// SEO de la web pública (auditoría técnica SEO/GEO del 3-nov-2026): título,
// descripción, canónica y JSON-LD de la portada. La canónica es
// www.edudream.es: el dominio sin www redirige ahí con un 308.
export const SITE_URL = "https://www.edudream.es";

/** 45-60 caracteres. */
export const HOME_TITLE = "Prepara tus exámenes con tus apuntes y pistas | Dream";

/** 150-160 caracteres. */
export const HOME_DESCRIPTION =
  "Sube tus apuntes y prepara el examen con pistas, tests y simulacros. Dream es gratis, sigue tu progreso y te ayuda a sacar tu mejor nota en la ESO y la PAU.";

const ORG = `${SITE_URL}/#organization`;
const WEBSITE = `${SITE_URL}/#website`;
const APP = `${SITE_URL}/#application`;

/** Grafo JSON-LD de la portada: organización, web, página y aplicación. */
export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG,
        url: SITE_URL,
        name: "Dream",
        logo: `${SITE_URL}/icon-512.png`,
        brand: { "@type": "Brand", name: "Dream" },
        description:
          "Plataforma de estudio que ayuda a entender los contenidos, practicar con tests y prepararse para los exámenes.",
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE,
        url: SITE_URL,
        name: "Dream — Tu compañero de estudio",
        inLanguage: "es",
        publisher: { "@id": ORG },
        description: "Dream te ayuda a entender lo que estudias: pregunta, sube tus apuntes y practica con tests.",
      },
      {
        "@type": "WebPage",
        "@id": `${SITE_URL}/#webpage`,
        url: SITE_URL,
        name: HOME_TITLE,
        headline: "Saca tu mejor nota.",
        inLanguage: "es",
        isPartOf: { "@id": WEBSITE },
        publisher: { "@id": ORG },
        about: { "@id": APP },
        mainEntity: { "@id": APP },
        audience: { "@type": "Audience", audienceType: "Estudiantes" },
        description: HOME_DESCRIPTION,
      },
      {
        "@type": "SoftwareApplication",
        "@id": APP,
        url: SITE_URL,
        name: "Dream",
        inLanguage: "es",
        operatingSystem: "Web",
        applicationCategory: "EducationalApplication",
        applicationSubCategory: "Study tool",
        creator: { "@id": ORG },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "EUR",
          category: "Free",
          availability: "https://schema.org/InStock",
          url: SITE_URL,
        },
        description:
          "Dream es una herramienta de estudio que convierte apuntes en exámenes, da pistas para entender los ejercicios (sin resolverlos por ti) y permite practicar con tests y simulacros.",
        featureList: [
          "Subir apuntes",
          "Convertir apuntes en exámenes",
          "Crear rutas de estudio",
          "Recibir pistas para resolver ejercicios",
          "Practicar con preguntas de los apuntes",
          "Realizar simulacros de examen",
          "Consultar el progreso de preparación",
        ],
      },
    ],
  };
}

/** JSON para <script type="application/ld+json">, sin poder cerrar la etiqueta. */
export const jsonLdScript = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** Páginas públicas para el sitemap (las de la app piden sesión). */
export const PUBLIC_PAGES = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/blog", priority: 0.8, changeFrequency: "daily" },
  { path: "/login", priority: 0.6, changeFrequency: "monthly" },
  { path: "/privacidad", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terminos", priority: 0.3, changeFrequency: "yearly" },
  { path: "/cookies", priority: 0.3, changeFrequency: "yearly" },
  { path: "/aviso-legal", priority: 0.3, changeFrequency: "yearly" },
] as const;
