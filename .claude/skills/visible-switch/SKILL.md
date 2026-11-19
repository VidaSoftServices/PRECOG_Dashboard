---
name: visible-switch
description: The per-Sensor visible switch (Sensor.Visible): hiding a Sensor from Live Monitoring and Smart Analytics only, the Hidden pill, the Visible import/export column. Use when working on, asking about or changing Sensor visibility, hidden Sensors, isShownSensor or the Visible switch.
---

# Per-Sensor visible switch

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\visible-switch.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\visible-switch.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/lib/sensorVisibility.ts` - isShownSensor, splitShownSensors
   - `src/pages/devices/VisibilityDialog.tsx` - also HiddenPill
   - `src/pages/monitoring/LiveMonitoringPage.tsx`
   - `src/pages/analytics/SmartAnalyticsPage.tsx`
   - `src/lib/sensorImport.ts`
   - `src/lib/sensorExport.ts`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Controllers/SensorsController.cs`
   - `DataAccess/LocalPG_Models/Sensor.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
