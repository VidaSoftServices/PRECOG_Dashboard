---
name: descriptions
description: Indicator descriptions: per-Sensor markdown texts in English and Hungarian stored by the API (pg.sensordescriptions), the Descriptions dialog (import, export, remove), the edit fields of the Sensor dialog and where they are shown. Use when working on, asking about or changing Sensor descriptions, DescriptionsDialog, SensorDescriptionsController or useSensorDescriptions.
---

# Indicator (Sensor) descriptions

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\descriptions.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\descriptions.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/devices/DescriptionsDialog.tsx`
   - `src/pages/devices/DescriptionFormattingLegend.tsx`
   - `src/lib/descriptionSheet.ts` - buildDescriptionSheet
   - `src/lib/useSensorDescriptions.ts`
   - `src/api/hooks/sensorDescriptions.ts`
   - `src/components/SensorDescription.tsx`
   - `src/lib/markdownLite.ts`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Controllers/SensorDescriptionsController.cs`
   - `VidaSoft.API/Services/SensorDescriptionRules.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
