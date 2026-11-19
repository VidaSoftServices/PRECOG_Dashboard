---
name: device-deletion
description: Device deletion: permanently deleting a Device with everything of it, and "Delete all data" that clears telemetry, Issues, models and training requests but keeps the Device and its configuration; typed-name confirmation, 409 while work runs. Use when working on, asking about or changing Device deletion, Delete all data, DeviceDeletionService or the Danger zone.
---

# Permanent Device deletion and "Delete all data"

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\device-deletion.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\device-deletion.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/devices/DeleteDeviceDialog.tsx` - also DeleteDeviceDataDialog
   - `src/components/TypeNameConfirmDialog.tsx`
   - `src/api/hooks/devices.ts` - useDeleteDevice, useDeleteDeviceData
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Services/DeviceDeletionService.cs`
   - `VidaSoft.API/Controllers/DevicesController.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
