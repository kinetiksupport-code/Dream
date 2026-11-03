import Link from 'next/link';
import { slugify } from 'babylovegrowth-next-js-blog';
import { BLOG_BASE_PATH } from '../constants';
import s from '../blog.module.css';

export function TagList({ keywords }: { keywords: string[] }) {
  const unique = Array.from(
    new Map(
      keywords
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .map((keyword) => [slugify(keyword), keyword] as const),
    ).entries(),
  ).filter(([slug]) => slug.length > 0);

  if (unique.length === 0) {
    return null;
  }

  return (
    <div className={s.tags}>
      {unique.map(([slug, label]) => (
        <Link key={slug} href={`${BLOG_BASE_PATH}/tag/${slug}`} className={s.tag}>
          {label}
        </Link>
      ))}
    </div>
  );
}
