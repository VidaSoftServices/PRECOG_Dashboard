# Remote firmware update of a Device (Dashboard)

The **Firmware card** on the Device page (`src/pages/devices/FirmwareCard.tsx`, shown on `DeviceDetailPage.tsx` after the maintenance history) lets a Company Admin upload a PlatformIO `firmware.bin` for the Device, install it on the Device, delete old uploads, and watch the update. Added 2026-11-25. API side and routes: `c:\VS\PRECOG_API\docs\features\firmware-update.md`; the device side and the fail-safe model: `docs/OTA_FIRMWARE_UPDATE.md` in the Vibration_Duo project.

## What the card shows (any level with access to the Device)

* **Running**: the version label the Device reported, the first 12 characters of the **SHA-256 of its own flash image** (identifies the real build; "uploaded release: x" when that hash equals an uploaded release), the state of its last report as a pill with icon and text (running, checking, downloading, staged, confirmed, rolled back, rejected, failed - never colour alone) and the time, and the **log** of the last report (rollback reasons, the loader log; plain text in a `<pre>`, never HTML).
* **Assigned**: the release the Device was told to install, with "waiting for the Device" while its running hash differs.
* **Reports of the Device**: the timeline table (`Reports of the Device`), newest first.
* **Uploaded firmware**: the table of releases (version, note, SHA-256 start, size, who and when).
* The card polls every 15 s while open (`useDeviceFirmware`): an update takes minutes and the Admin watches it. A Device installs at its next check, which is **at most 30 minutes** after the assignment; the card says so.

## Admin only (a Reader sees none of these controls, not even disabled)

* **Upload**: file input (`Firmware file (firmware.bin)`), `Version label`, optional `Note`; the button is disabled until a file and a label exist. Sent as multipart (`useUploadFirmware`, a `FormData` built by a `bodySerializer`; the generated body type is bypassed with a cast). Nothing is installed by the upload.
* **Install on this Device**: per release, opens a `ConfirmDialog` where the **Device name must be typed**; then `PUT .../Firmware/Assign`. The dialog states that the Device installs it at its next check (within 30 minutes) and rolls back by itself within 10 minutes if the new firmware does not get online. Assigning an older release is a downgrade.
* **Delete**: per release, disabled for the assigned one (the API answers 409), confirmed in a dialog.

## Code

`src/api/hooks/firmware.ts` (`useDeviceFirmware`, `useUploadFirmware`, `useAssignFirmware`, `useDeleteFirmwareRelease`, `FIRMWARE_STATES`), `src/api/queryKeys.ts` (`firmware(deviceId)`), `src/api/schema.generated.ts` (regenerated from the local API), `src/lib/translations.firmware.ts` (Hungarian; registered in `translations.ts`; the translation test fails for a missing text). Tests: `FirmwareCard.test.tsx` (display, Reader sees no controls, install needs the typed name, multipart upload, delete rules, empty state).

## Rules

* The upload, the assignment and the delete are Company Admin operations on the server too; the card hides them for Readers anyway.
* The firmware log is device-supplied text: always rendered as text.
* No firmware byte is ever read or parsed in the browser: the SHA-256, the layout checks and the loader mark are checked by the API and the Device.
