/**
 * Framework-agnostic session store. Deliberately not a React context itself -
 * the API client (src/api/client.ts) needs to read the current token and react
 * to a 401 without importing React or creating a client <-> AuthContext import
 * cycle. `src/auth/AuthContext.tsx` wraps this in `useSyncExternalStore` for
 * component consumption.
 *
 * The token lives ONLY in memory (this module's closure) - never
 * localStorage/sessionStorage/a cookie/a URL. A page refresh always requires
 * re-authentication. This is a deliberate carry-over from the old dashboard's
 * one correct security property, kept intentionally rather than "fixed".
 */

export type PrincipalType = 'User' | 'DevicePrincipal';

export interface Session {
  token: string;
  principalType: PrincipalType;
  /** ISO timestamp. Human tokens: ~900s from issue (Release) or effectively unlimited (DEBUG). Device tokens: exactly 900s, never relaxed. */
  expiresAt: string;
}

type Listener = () => void;

let session: Session | null = null;
const listeners = new Set<Listener>();
const unauthorizedListeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getSession(): Session | null {
  return session;
}

export function setSession(next: Session): void {
  session = next;
  emit();
}

export function clearSession(): void {
  session = null;
  emit();
}

export function getToken(): string | null {
  return session?.token ?? null;
}

export function isExpired(): boolean {
  if (!session) return true;
  return new Date(session.expiresAt).getTime() <= Date.now();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Session | null {
  return session;
}

/** Called by the API client whenever a request comes back 401. */
export function notifyUnauthorized(): void {
  clearSession();
  for (const listener of unauthorizedListeners) listener();
}

/** AuthContext registers here to redirect to /login on a 401 from any call site, not just the login form. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}
