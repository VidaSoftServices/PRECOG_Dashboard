/**
 * The browser session that lasts until sign-out (docs/features/session-expiry.md "Stay signed in"). The API keeps a long-lived refresh token in an HttpOnly,
 * Secure, SameSite=Strict cookie (`precog_session`, only for /api/Authentication) that JavaScript can neither read nor write; these calls only ask the browser
 * to send it (`credentials: 'include'`). The 15-minute access key stays in memory (authStore) exactly as before.
 *
 * The calls go around `apiClient` on purpose: a 401 from Refresh only means "no session" and must not mark the access as expired (the client middleware's
 * global 401 handling), and they carry no HMAC_Key. The custom X-Precog-Session header makes the browser ask the API first (CORS preflight), so only the
 * Dashboard's own origins can send them.
 */
const baseUrl = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '');

export const SESSION_HEADER = 'X-Precog-Session';

export interface RefreshedKey {
  key: string;
  /** The name the session belongs to (login name; e-mail address for the platform administrator) - for the "sign in again" dialog. */
  userName: string | null;
}

let inFlight: Promise<RefreshedKey | null> | null = null;

/**
 * A new access key from the session cookie, or null when there is no session (never signed in with a session, signed out, ended, or the API cannot be
 * reached). Calls at the same time share one request, so one tab never rotates the token twice at once.
 */
export function refreshSession(): Promise<RefreshedKey | null> {
  inFlight ??= (async () => {
    try {
      const response = await fetch(`${baseUrl}/api/Authentication/Refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { [SESSION_HEADER]: '1' },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { _HMAC_Key?: string; userName?: string | null };
      return body._HMAC_Key ? { key: body._HMAC_Key, userName: body.userName ?? null } : null;
    } catch {
      return null;
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Ends the session on the API (the refresh token is revoked and the cookie removed). Never throws; gives up after a few seconds. */
export async function endSession(timeoutMs = 4000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(`${baseUrl}/api/Authentication/SignOut`, {
      method: 'POST',
      credentials: 'include',
      headers: { [SESSION_HEADER]: '1' },
      signal: controller.signal,
    });
  } catch {
    // offline or slow: the cookie still ends at the latest 8 hours after its last use
  } finally {
    clearTimeout(timer);
  }
}

/** How long before the assumed end of an access key it is renewed. */
export const REFRESH_AHEAD_MS = 60_000;
