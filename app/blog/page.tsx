import type { Metadata } from 'next';
import { ArticleCard } from './components/ArticleCard';
import { BlogShell } from './components/BlogShell';
import { Pagination } from './components/Pagination';
import { BLOG_BASE_PATH, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from './constants';
import { blog } from './lib/blog-client';
import { paginate, parsePage } from './pagination';
import s from './blog.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}${BLOG_BASE_PATH}` },
  openGraph: { type: 'website', title: SITE_NAME, description: SITE_DESCRIPTION, url: `${SITE_URL}${BLOG_BASE_PATH}`, locale: 'es_ES' },
};

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const articles = await blog.getAllArticles();
  const { items, info } = paginate(articles, parsePage(page));

  return (
    <BlogShell>
      <header className={s.header}>
        <h1 className={s.title}>{SITE_NAME}</h1>
        <p className={s.lead}>{SITE_DESCRIPTION}</p>
      </header>

      {items.length === 0 ? (
        <p className={s.empty}>Todavía no hay artículos. Vuelve pronto.</p>
      ) : (
        <div className={s.grid}>
          {items.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      <Pagination basePath={BLOG_BASE_PATH} info={info} />
    </BlogShell>
  );
}
