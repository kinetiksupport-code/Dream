import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleJsonLd } from '../components/ArticleJsonLd';
import { BlogShell } from '../components/BlogShell';
import { TagList } from '../components/TagList';
import { BLOG_BASE_PATH, SITE_URL } from '../constants';
import { formatDate } from '../format';
import { blog } from '../lib/blog-client';
import s from '../blog.module.css';
import '../blog-content.css';

// Dinámica: el layout raíz lee las cabeceras (nonce de la CSP), así que no
// puede ser ISR. Los datos sí se cachean un día en el fetch del cliente.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await blog.getArticleBySlug(slug);
  if (!article) {
    return {};
  }
  const canonical = `${SITE_URL}${BLOG_BASE_PATH}/${article.slug}`;
  return {
    title: article.title,
    description: article.meta_description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.meta_description,
      url: canonical,
      locale: 'es_ES',
      images: article.hero_image_url ? [{ url: article.hero_image_url }] : undefined,
      publishedTime: article.published_at,
      modifiedTime: article.updated_at,
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await blog.getArticleBySlug(slug);
  if (!article || !article.published) {
    notFound();
  }

  return (
    <BlogShell narrow>
      <ArticleJsonLd data={article.jsonLd} />
      <ArticleJsonLd data={article.faqJsonLd} />

      <Link href={BLOG_BASE_PATH} className={s.back}>
        ← Todos los artículos
      </Link>

      <article>
        <header>
          <h1 className={s.title}>{article.title}</h1>
          <time dateTime={article.published_at} className={`${s.date} ${s.articleDate}`}>
            {formatDate(article.published_at)}
          </time>
        </header>

        {article.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={s.hero} src={article.hero_image_url} alt="" decoding="async" />
        ) : null}

        <div className="blog-content" dangerouslySetInnerHTML={{ __html: article.content_html }} />

        <footer className={s.articleFooter}>
          <TagList keywords={[article.seedKeyword ?? '', ...article.keywords]} />
        </footer>
      </article>
    </BlogShell>
  );
}
