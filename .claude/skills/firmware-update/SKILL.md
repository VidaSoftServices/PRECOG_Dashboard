---
name: firmware-update
description: Remote firmware update of a Device (OTA) in the Dashboard: the Firmware card on the Device page (upload firmware.bin, install with the Device name typed, delete, running version / SHA-256, report timeline and log). Use when working on, asking about or changing the Firmware card, useDeviceFirmware or the firmware routes.
---

# Remote firmware update of a Device

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\firmware-update.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\firmware-update.md (the API side)
   - the device side: C:\Users\vidat\Documents\PlatformIO\Projects\Vibration_Duo\docs\OTA_FIRMWARE_UPDATE.md
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/devices/FirmwareCard.tsx` and `FirmwareCard.test.tsx`
   - `src/api/hooks/firmware.ts`, `src/api/queryKeys.ts` (`firmware`)
   - `src/lib/translations.firmware.ts`
   API side: `VidaSoft.API/Controllers/FirmwareController.cs` (paths relative to c:\VS\PRECOG_API).

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.
