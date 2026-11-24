import type { Language } from './language';

/**
 * The single-use token of an invitation / password-reset e-mail travels in the URL FRAGMENT (`#token=...&lang=hu`): a browser never sends the
 * fragment to a server or a proxy, so the token does not end up in an access log. This reads it, and `withoutFragment` removes it from the address bar
 * afterwards (it stays in the page's state only), so it is not left in the history, a screenshot or a copied address.
 */
export interface LinkToken {
  token: string | null;
  language: Language | null;
}

export function parseLinkFragment(hash: string): LinkToken {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const token = params.get('token')?.trim() || null;
  const lang = params.get('lang');
  return { token, language: lang === 'hu' || lang === 'en' ? lang : null };
}

/** The current address without its fragment (same path and query). */
export function withoutFragment(location: { pathname: string; search: string }): string {
  return `${location.pathname}${location.search}`;
}
