---
name: platform-admin
description: The platform administrator (VSSSysAdmin) and own user management: the env-configured platform account, creating Companies, inviting the first Admin by e-mail, single-use invitation and password-reset links, the last-Admin rule, IssueEmail / Dashboard__BaseUrl settings. Use when working on, asking about or changing the platform account, PlatformController, AccountsController, AccountFlows, UserTokenService, AccountMailer, invitations or password reset.
---

# Platform administrator, invitations and password reset

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_API\docs\features\platform-admin.md (this feature, API)
   - c:\VS\PRECOG_API\docs\features\company-identity.md (the User store, sign-in and synchronization it builds on)
   - c:\VS\PRECOG_Dashboard\docs\features\platform-admin.md (the Dashboard side)
   Also respect the general rules in `VidaSoft.API/CLAUDE.md` (and `AGENTS.md`).
2. Any change to the feature updates its doc file in BOTH repositories; every new user-visible text is written in English and Hungarian (`t()`).
3. Never log, echo, return or put into test data a real hash, token, link or password; tests use invented values and never a shared or real database. Production database writes only after the user's explicit word.
