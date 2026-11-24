---
name: session-expiry
description: Session expiry and staying signed in: the browser session (rotated refresh token in an HttpOnly cookie) renews the 15-minute key before it ends, after a page load and on a 401; SessionExpiredDialog asks for the password only when the session ended; sign-out ends it on the API. Use when working on, asking about or changing session expiry, re-authentication, the refresh / sign-out calls, browserSession, notifyUnauthorized, authStore or SessionExpiredDialog.
---

# Session expiry and staying signed in

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\session-expiry.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\session-expiry.md (the API: cookie, rotation, limits, endpoints)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/auth/authStore.ts`
   - `src/auth/browserSession.ts` - refreshSession, endSession
   - `src/auth/RequireAuth.tsx` - waits while a page load restores the session
   - `src/lib/staleBuildReload.ts`
   - `src/auth/SessionExpiredDialog.tsx`
   - `src/auth/AuthContext.tsx`
   - `src/api/client.ts`
   - `src/app/AppShell.tsx`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
