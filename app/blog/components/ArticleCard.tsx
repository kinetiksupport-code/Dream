import Link from 'next/link';
import type { BlogArticleSummary } from 'babylovegrowth-next-js-blog';
import { BLOG_BASE_PATH } from '../constants';
import { formatDate } from '../format';
import s from '../blog.module.css';

export function ArticleCard({ article }: { article: BlogArticleSummary }) {
  return (
    <Link href={`${BLOG_BASE_PATH}/${article.slug}`} className={s.card}>
      {article.hero_image_url ? (
        // Imagen directa (sin el optimizador de Next): no abre /_next/image a
        // cualquier dominio. La CSP de /blog permite imágenes https.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.cardImage} src={article.hero_image_url} alt="" loading="lazy" decoding="async" />
      ) : null}
      <div className={s.cardBody}>
        <time dateTime={article.published_at} className={s.date}>
          {formatDate(article.published_at)}
        </time>
        <h2 className={s.cardTitle}>{article.title}</h2>
        <p className={s.cardText}>{article.meta_description}</p>
      </div>
    </Link>
  );
}
