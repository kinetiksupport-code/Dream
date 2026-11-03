import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleCard } from '../../components/ArticleCard';
import { BlogShell } from '../../components/BlogShell';
import { Pagination } from '../../components/Pagination';
import { BLOG_BASE_PATH } from '../../constants';
import { blog } from '../../lib/blog-client';
import { paginate, parsePage } from '../../pagination';
import s from '../../blog.module.css';

// Dinámica: el layout raíz lee las cabeceras (nonce de la CSP), así que no
// puede ser ISR. Los datos sí se cachean un día en el fetch del cliente.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Artículos sobre «${slug.replace(/-/g, ' ')}»` };
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page } = await searchParams;
  const articles = await blog.getArticlesByTag(slug);
  if (articles.length === 0) {
    notFound();
  }
  const basePath = `${BLOG_BASE_PATH}/tag/${slug}`;
  const { items, info } = paginate(articles, parsePage(page));

  return (
    <BlogShell>
      <header className={s.header}>
        <Link href={BLOG_BASE_PATH} className={s.back}>
          ← Todos los artículos
        </Link>
        <h1 className={s.title}>{slug.replace(/-/g, ' ')}</h1>
        <p className={s.lead}>
          {articles.length} {articles.length === 1 ? 'artículo' : 'artículos'}
        </p>
      </header>

      <div className={s.grid}>
        {items.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>

      <Pagination basePath={basePath} info={info} />
    </BlogShell>
  );
}
