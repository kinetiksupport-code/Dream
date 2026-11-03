export const BLOG_BASE_PATH = '/blog';

export const PAGE_SIZE = 12;

export const SITE_NAME = 'Blog de Dream';

export const SITE_DESCRIPTION = 'Guías y consejos para estudiar mejor y sacar tu mejor nota en ESO, Bachillerato y la PAU.';

export const REVALIDATE_SECONDS = process.env.NODE_ENV === 'development' ? 10 : 86400;

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.edudream.es').replace(/\/+$/, '');
