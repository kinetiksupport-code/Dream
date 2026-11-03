// Blog de BabyLoveGrowth (babylovegrowth-next-js-blog): artículos para SEO.
// La clave BABYLOVEGROWTH_BLOG_API_KEY vive solo en el servidor (Vercel), nunca
// con NEXT_PUBLIC_. Sin clave, el blog sale vacío en lugar de romper la web; si
// la API falla al compilar, también vacío (se rellena en la siguiente
// revalidación); en ejecución el error sube y Next.js mantiene la versión
// anterior en caché.
import { BlogClient, type BlogArticle, type BlogArticleSummary, type BlogTag } from 'babylovegrowth-next-js-blog';
import { REVALIDATE_SECONDS } from '../constants';

const apiKey = process.env.BABYLOVEGROWTH_BLOG_API_KEY ?? '';
const client = new BlogClient({
  apiKey,
  baseUrl: process.env.BABYLOVEGROWTH_BLOG_API_URL,
  revalidate: REVALIDATE_SECONDS,
});
const building = process.env.NEXT_PHASE === 'phase-production-build';

async function safely<T>(fallback: T, call: () => Promise<T>): Promise<T> {
  if (!apiKey) return fallback;
  try {
    return await call();
  } catch (error) {
    if (!building) throw error;
    console.error('blog: no se pudieron leer los artículos al compilar', error);
    return fallback;
  }
}

export const blog = {
  getAllArticles: (): Promise<BlogArticleSummary[]> => safely([], () => client.getAllArticles()),
  getArticleBySlug: (slug: string): Promise<BlogArticle | null> => safely(null, () => client.getArticleBySlug(slug)),
  getTags: (): Promise<BlogTag[]> => safely([], () => client.getTags()),
  getArticlesByTag: (slug: string): Promise<BlogArticleSummary[]> => safely([], () => client.getArticlesByTag(slug)),
  getSitemapEntries: () => safely([], () => client.getSitemapEntries()),
};
