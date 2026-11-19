---
name: smart-analytics
description: Smart Analytics: historical single- and multi-Sensor charts and the two-Device comparison (one shared chart, compatibility notice, average / UCL3 / LCL3 / setpoint lines, linked Sensor selects), Sensor filter and enlargeable charts. Use when working on, asking about or changing Smart Analytics, Compare Devices, Sensor comparison or the analytics charts.
---

# Smart Analytics and Sensor / Device comparison

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\smart-analytics.md (this repository, Dashboard)
   This feature has a doc only in the Dashboard repository; the API has no doc and no skill for it.
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/analytics/SmartAnalyticsPage.tsx`
   - `src/components/charts/EnlargeableTelemetryChart.tsx`
   - `src/components/charts/TelemetryChart.tsx`
   - `src/lib/seriesAverage.ts`
   - `src/lib/sensorFilter.ts`
   - `src/lib/sensorLink.ts` - findSameSensor
   - `src/api/hooks/telemetry.ts` - useTelemetryDateRange

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
