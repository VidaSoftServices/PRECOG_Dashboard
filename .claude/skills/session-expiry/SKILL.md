---
name: session-expiry
description: Session expiry in the Dashboard: on a 401 the access is marked expired, requests fail fast, and SessionExpiredDialog asks for the same user's password over the current page, then refetches failed queries. Use when working on, asking about or changing session expiry, re-authentication, notifyUnauthorized, authStore or SessionExpiredDialog.
---

# Session expiry: sign in again in place

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\session-expiry.md (this repository, Dashboard)
   This feature has a doc only in the Dashboard repository; the API has no doc and no skill for it.
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/auth/authStore.ts`
   - `src/auth/SessionExpiredDialog.tsx`
   - `src/auth/AuthContext.tsx`
   - `src/api/client.ts`
   - `src/app/AppShell.tsx`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
