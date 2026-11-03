export const BLOG_BASE_PATH = '/blog';

export const PAGE_SIZE = 12;

export const SITE_NAME = 'Blog de Dream';

export const SITE_DESCRIPTION = 'Guías y consejos para estudiar mejor y sacar tu mejor nota en ESO, Bachillerato y la PAU.';

export const REVALIDATE_SECONDS = process.env.NODE_ENV === 'development' ? 10 : 86400;

/**
 * URL absoluta del sitio para sitemap y canónicas. NEXT_PUBLIC_SITE_URL puede
 * venir sin esquema («www.edudream.es»): se le añade https://, porque Google
 * rechaza un <loc> sin él.
 */
export function absoluteSiteUrl(value: string | undefined): string {
  const raw = (value ?? '').trim().replace(/\/+$/, '');
  if (!raw) return 'https://www.edudream.es';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export const SITE_URL = absoluteSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
