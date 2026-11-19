---
name: sensor-import
description: Bulk Sensor import: creating or updating hundreds of Sensors of a Device from a pasted Excel range or CSV (template, validation, setpoint columns, Calculate / Visible columns, Sensor ID map), the Vibration_Duo sheet and the firmware sensor_map export. Use when working on, asking about or changing the Sensor import, the import template, sensorImport.ts, the Sensor ID map or Export sensor for hardware.
---

# Bulk Sensor import and Sensor sheets

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\sensor-import.md (this repository, Dashboard)
   This feature has a doc only in the Dashboard repository; the API has no doc and no skill for it.
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/devices/SensorImportDialog.tsx`
   - `src/lib/sensorImport.ts`
   - `src/api/hooks/sensors.ts` - importSensors
   - `src/api/rateLimited.ts`
   - `src/pages/devices/ExportSensorMapButton.tsx`
   - `src/lib/sensorMap.ts`
   - `src/pages/devices/ExportAllSensorsButton.tsx`
   - `src/lib/sensorExport.ts`
   - `samples/`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
