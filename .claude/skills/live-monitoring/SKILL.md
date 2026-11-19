---
name: live-monitoring
description: Live Monitoring: near-real-time Sensor cards fed by bounded polling of the batched trailing read (MeasuredTrailingPeriodsBatch), the rate limit / 429 cooldown, filter, paging, manual refresh and the enlarged chart. Use when working on, asking about or changing Live Monitoring, the live cards, the polling schedule, MeasuredTrailingPeriods(Batch), the enlarged live chart or the arrow-key stepping.
---

# Live Monitoring

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\live-monitoring.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\live-monitoring.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/monitoring/LiveMonitoringPage.tsx`
   - `src/pages/monitoring/useLiveMonitoringSchedule.ts` - the orchestrator (one request per cycle, cooldown)
   - `src/api/hooks/telemetry.ts` - fetchAndCacheTelemetryTrailingBatch, useTelemetryTrailingWithLimits
   - `src/lib/pollIntervals.ts`
   - `src/lib/usePageVisible.ts`
   - `src/lib/useArrowStep.ts`
   - `src/lib/sensorFilter.ts`
   - `src/components/charts/TelemetryChart.tsx`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Controllers/ContinuousController.cs` - GetMeasuredTrailingPeriodsBatch, TrailingBatchSql
   - `VidaSoft.API/Services/ControlLimitReader.cs`
   - `VidaSoft.API/Controllers/DiagnosticsController.cs` - TrailingBatchPlan

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
