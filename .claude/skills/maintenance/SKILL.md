---
name: maintenance
description: Sensor maintenance mode and maintenance history: switching maintenance on/off per Sensor or for the whole Device, ending with a kind (Replacement / Minor), baseline segments and warm-up, changing the kind later, starting a new baseline, and the maintenance markers on charts. Use when working on, asking about or changing maintenance mode, maintenance history, baselines, warm-up or rebaseline.
---

# Sensor maintenance mode, maintenance history and baselines

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\maintenance.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\maintenance.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/api/hooks/maintenance.ts`
   - `src/pages/devices/MaintenanceAllDialog.tsx`
   - `src/pages/devices/EndMaintenanceDialog.tsx`
   - `src/pages/devices/MaintenanceHistoryCard.tsx`
   - `src/pages/devices/ChangeMaintenanceKindDialog.tsx`
   - `src/pages/devices/StartBaselineDialog.tsx`
   - `src/lib/maintenanceMarkers.ts`
   - `src/components/StatusPill.tsx` - MaintenancePill
   - `src/pages/devices/DeviceDetailPage.tsx`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Controllers/MaintenanceController.cs`
   - `VidaSoft.API/Controllers/MaintenancesController.cs`
   - `VidaSoft.API/Services/BaselinePlan.cs`
   - `VidaSoft.API/Services/MaintenanceHistory.cs`
   - `DataAccess/LocalPG_Models/SensorMaintenance.cs`
   - `VidaSoft.API/Calculations.cs` - AnalyseSignalDatabase, CalculatePredictionAsync
   - `VidaSoft.API/Services/ControlLimitCalculator.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
