import Link from 'next/link';
import type { PageInfo } from '../pagination';
import { pageHref } from '../pagination';
import s from '../blog.module.css';

export function Pagination({ basePath, info }: { basePath: string; info: PageInfo }) {
  if (info.totalPages <= 1) {
    return null;
  }
  return (
    <nav className={s.pagination} aria-label="Páginas">
      {info.hasPrev ? (
        <Link href={pageHref(basePath, info.page - 1)} className={s.pageLink}>
          ← Anteriores
        </Link>
      ) : (
        <span className={s.pageLink} aria-disabled="true">
          ← Anteriores
        </span>
      )}
      <span className={s.pageInfo}>
        Página {info.page} de {info.totalPages}
      </span>
      {info.hasNext ? (
        <Link href={pageHref(basePath, info.page + 1)} className={s.pageLink}>
          Siguientes →
        </Link>
      ) : (
        <span className={s.pageLink} aria-disabled="true">
          Siguientes →
        </span>
      )}
    </nav>
  );
}
