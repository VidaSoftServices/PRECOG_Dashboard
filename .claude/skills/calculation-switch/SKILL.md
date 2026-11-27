---
name: calculation-switch
description: The raw calculation switch (Sensor.ProcessingEnabled, "Calculate" on the raw level of the Policies page): raw values stored but not analysed or trained on, aggregation levels evaluated by their own switches, catch-up when switched on, delete-only raw Recalc, the calculation-off marking. Use when working on, asking about or changing the Calculate switch, processingEnabled, the calculation-off pill or delete-only Recalc.
---

# Per-Sensor calculation switch

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\calculation-switch.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\calculation-switch.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/devices/DeviceDetailPage.tsx` - ProcessingDialog
   - `src/components/StatusPill.tsx` - ProcessingOffPill
   - `src/lib/recalculation.ts` - isDeleteOnly
   - `src/pages/devices/RecalculateDialog.tsx`
   - `src/pages/devices/RecalculationProgress.tsx`
   - `src/api/hooks/sensors.ts` - useUpdateSensor
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Controllers/SensorsController.cs`
   - `VidaSoft.API/Services/SignalAnalysisService.cs`
   - `VidaSoft.API/Services/RecalculationService.cs` - RequestCatchUp
   - `DataAccess/TrainingEligibilityService.cs` - ResolveTargetSchemaAsync

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
