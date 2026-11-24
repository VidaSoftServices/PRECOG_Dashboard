# Session expiry: sign in again in place

What happens when the 15-minute access token expires: `notifyUnauthorized()` marks the access expired instead of signing out, page requests fail fast, `SessionExpiredDialog` asks for the password of the same (read-only) user over the current page, and after a successful sign-in the failed queries are refetched. The token storage and logout rules stay in CLAUDE.md ("Authentication and security").

Related: the API has no doc of its own for this feature (Dashboard-only doc).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## Session expiry: sign in again in place

The access token lives 15 minutes and the API has no refresh endpoint (a new key needs the username and password), and this dashboard never keeps the password. Instead of throwing the person out to `/login` when it expires, it asks for the password again **over the current page**, so the page, its filters, an open chart and anything typed stay exactly as they were.

- **Detection**: any request answered `401` while signed in. `authStore.notifyUnauthorized()` no longer clears the session; it sets `reauthRequired` (once), after which `getToken()` returns null so the refused token is not sent again. With no session (a wrong password on the login form) a 401 does nothing, as before.
- **While expired**, `client.ts` fails page requests fast with a 401 `ApiError` ("Your session has expired - sign in again to continue.") without calling the API; only `/api/Authentication/*` goes through. Nothing hammers the API with a dead token.
- **`SessionExpiredDialog`** (`src/auth/`, mounted in the app shell; an alert dialog that cannot be dismissed any other way): the **username is shown read-only** (kept in memory by `AuthContext`; it is not a secret) so it can only continue as the account that was signed in - **Sign out** is the way to change account; a password field; a wrong password shows the API's message and keeps the dialog open. The password is held only by the field while typing and cleared after every attempt; it is never stored and there is no automatic re-sign-in.
- **After a successful sign-in** the dialog closes, the new token is used, and every query that had failed is refetched (`invalidateQueries` on error-state queries); the toast says an action that did not go through has to be repeated (a mutation refused with 401 is not replayed automatically). Live Monitoring's rotation simply carries on with the new token.
- Not covered, by design: nothing renews the access before it expires (that would need either the password kept in memory or a new server endpoint; the in-place dialog was chosen as the most secure option). Tests: `authStore.test.ts`, `RequireAuth.test.tsx` (a 401 keeps the page; sign-out still redirects), `client.test.ts` (fail-fast while expired, the sign-in call still goes through), `SessionExpiredDialog.test.tsx` (opens on 401, same-user read-only name, wrong password, success keeps typed text and the failed query recovers, Sign out); checked in a real Chromium with a mocked API (token key-1 -> key-2, no redirect, same URL).

## Sign out is a full sign-out (2026-11-24)

`logout()` (`AuthContext.tsx`: the user menu's Sign out and the expiry dialog's Sign out) used to clear only the in-memory token. The TanStack Query cache (a module-level singleton), the per-server routing and the selected Device survived, and the login page returned the next person to the page that was open, so signing in as another user often showed the previous user's dashboard. Now `logout()` clears the session, the user name and details, empties the query cache (`queryClient.clear()`) and loads `/login` as a fresh page (`loadLoginPage()`, `src/auth/loadLoginPage.ts`), so no in-memory state of the previous sign-in survives (the token is memory-only anyway, nothing else is lost). Test: `AuthContext.test.tsx` ("AuthContext logout").
