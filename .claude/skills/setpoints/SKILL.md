---
name: setpoints
description: Setpoints: time-versioned target / tolerance intervals of a Sensor - Manage Setpoints (export, import as the complete truth, preview), Delete setpoints, the setpoint columns of Export all sensors, and the API delete endpoint and Device-wide setpoint / policy listings. Use when working on, asking about or changing setpoints, targets, tolerances, setpointSheet / setpointSync or the Setpoints endpoints.
---

# Setpoints (target / tolerance intervals)

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\setpoints.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\setpoints.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/devices/ManageSetpointsDialog.tsx`
   - `src/pages/devices/DeleteSetpointsDialog.tsx`
   - `src/lib/setpointSheet.ts`
   - `src/api/hooks/setpointSync.ts`
   - `src/api/hooks/setpoints.ts`
   - `src/pages/devices/ExportAllSensorsButton.tsx`
   - `src/lib/sensorExport.ts`
   - `src/lib/policies.ts` - isRawPolicy
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Controllers/SetpointsController.cs`
   - `VidaSoft.API/Controllers/DeviceConfigurationController.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
