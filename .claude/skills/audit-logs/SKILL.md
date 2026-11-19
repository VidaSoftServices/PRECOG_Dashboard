---
name: audit-logs
description: Logs page and log endpoints: the Admin-only activity (audit) log and system log, their filters and paging, GET /api/Logs/Audit and /api/Logs/System. Use when working on, asking about or changing the Logs page, audit events display, system log search, LogsController or logFilters.
---

# Logs: activity log and system log

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\audit-logs.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\audit-logs.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/admin/LogsPage.tsx`
   - `src/lib/logFilters.ts`
   - `src/api/hooks/logs.ts`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Controllers/LogsController.cs`
   - `VidaSoft.API/Services/AuditEventWriter.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
