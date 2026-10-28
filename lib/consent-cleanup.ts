// When the student withdraws consent for Preferences cookies, what the support
// chat left in the browser goes away: its cookies (crisp-client/…), its
// localStorage and sessionStorage keys and its DOM. Kept apart from lib/crisp.ts
// so the app shell can run this without importing the chat loader.

const PREFIXES = ["crisp-client", "crisp_"];
const matches = (name: string) => PREFIXES.some((p) => name.startsWith(p));

interface CookieDoc {
  cookie: string;
}
/** Expires every Crisp cookie on this host and its parent domains. */
export function clearCrispCookies(doc: CookieDoc, hostname: string) {
  const names = doc.cookie
    .split(";")
    .map((part) => part.split("=")[0].trim())
    .filter((name) => name && matches(name));
  const parts = hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join(".")}`);
  for (const name of names)
    for (const domain of domains)
      doc.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
  return names.length;
}

export function clearCrispStorage(storages: Array<Pick<Storage, "length" | "key" | "removeItem"> | null>) {
  let removed = 0;
  for (const storage of storages) {
    if (!storage) continue;
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && matches(key)) keys.push(key);
      }
      for (const key of keys) storage.removeItem(key);
      removed += keys.length;
    } catch {
      /* storage blocked: nothing to clear */
    }
  }
  return removed;
}

/** Was the chat loaded in this page? Then only a reload stops its connection. */
export function chatLoadedHere(win: { $crisp?: unknown }) {
  return win.$crisp !== undefined;
}
