# Logs: activity log and system log

The Admin-only Logs page (`/admin/logs`): the Activity log tab (audit trail) and the System log tab (diagnostic log), newest 30 entries by default, filters applied on demand, "Load 30 more" paging.

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/audit-logs.md](../../../PRECOG_API/docs/features/audit-logs.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## Logs page (Admin only)

**Logs** in the navigation (`/admin/logs`, `LogsPage.tsx`, behind `RequireAdmin`; the API itself answers 403 to a non-Admin and the nav entry is hidden for a Reader) has two tabs:

- **Activity log** - the audit trail (`GET /api/Logs/Audit`): who changed what, including device deletions and "delete all data". Columns: time, action, entity, who, details (before/after state, IP). Filters: From/To, action (contains), entity type, entity id, user id.
- **System log** - the diagnostic log (`GET /api/Logs/System`): time, level (icon + text badge, never colour alone), application, device/sensor, message, and an expandable "Details" (request id, trace id, IP, user, properties). Filters: From/To, level (and above), application, device/sensor/user id, message contains. Without a From the API searches the last 7 days, and a search window may not exceed 31 days; the API's explanation is shown if it refuses.

Both show the **newest 30 entries by default**, filters apply only on **Apply filters** (Reset clears them), and **Load 30 more** pages on (`useInfiniteQuery`, `skip` pages; the API caps paging at 5000 skipped entries, which the page says). Filter-to-query translation is the pure, tested `src/lib/logFilters.ts` (empty fields are omitted, local date-times become UTC instants, ids must be whole numbers). Entries of other Companies and company-less system entries never reach the page (the API filters them).
