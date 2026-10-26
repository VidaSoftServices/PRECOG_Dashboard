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
/**
 * True from the moment a request signed in with the current token came back 401 (the access expired or was withdrawn) until the
 * person signs in again. The page stays exactly as it is - no redirect, no state lost - and the sign-in dialog asks for the
 * password in place. The refused token is never sent again meanwhile (getToken returns null).
 */
let reauthRequired = false;
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
  reauthRequired = false;
  emit();
}

export function clearSession(): void {
  session = null;
  reauthRequired = false;
  emit();
}

export function getToken(): string | null {
  return reauthRequired ? null : (session?.token ?? null);
}

/** True while the access has expired and a new sign-in (in place) is needed - see {@link notifyUnauthorized}. */
export function isReauthRequired(): boolean {
  return reauthRequired;
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

/**
 * Called by the API client whenever a request comes back 401. While signed in this means the access expired (or was
 * withdrawn): the session is NOT torn down and nobody is redirected - the sign-in dialog opens over the current page
 * (isReauthRequired) and, after the password is entered again, the page carries on. With no session (a failed sign-in attempt on
 * the login form) or when already waiting for the new sign-in, there is nothing to do.
 */
export function notifyUnauthorized(): void {
  if (!session || reauthRequired) return;
  reauthRequired = true;
  emit();
  for (const listener of unauthorizedListeners) listener();
}

/** Notified once each time the access is found expired (a 401 while signed in). */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}
