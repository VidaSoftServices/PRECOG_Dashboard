# Remote firmware update of a Device (Dashboard)

The **Firmware** button in the header of the Device page (it replaced the *Analyze* button, 2026-11-26) opens the Device's firmware page (`/devices/:deviceId/firmware`, `src/pages/devices/FirmwarePage.tsx`, any level) with the **Firmware card** (`FirmwareCard.tsx`). It lets a Company Admin upload a PlatformIO `firmware.bin` for the Device, install it on the Device, delete old uploads, and watch the update. Added 2026-11-25. API side and routes: `c:\VS\PRECOG_API\docs\features\firmware-update.md`; the device side and the fail-safe model: `docs/OTA_FIRMWARE_UPDATE.md` in the Vibration_Duo project.

## What the card shows (any level with access to the Device)

* **Running**: the version label the Device reported, the first 12 characters of the **SHA-256 of its own flash image** (identifies the real build; "uploaded release: x" when that hash equals an uploaded release), the state of its last report as a pill with icon and text (running, checking, downloading, staged, confirmed, rolled back, rejected, failed - never colour alone) and the time, and the **log of the last problem** (a rollback, a rejection or a failed update: the reason and the loader log; only the last one exists, the API keeps no log of good updates; plain text in a `<pre>`, never HTML).
* **Assigned**: the release the Device was told to install, with "waiting for the Device" while its running hash differs.
* **Reports of the Device**: the timeline table (`Reports of the Device`), newest first.
* **Uploaded firmware**: the table of releases (version, note, SHA-256 start, size, who and when).
* The card polls every 15 s while open (`useDeviceFirmware`): an update takes minutes and the Admin watches it. A Device learns of an assignment from its next heartbeat (about 30 seconds) and installs it within a minute or two; the card says so.

## Admin only (a Reader sees none of these controls, not even disabled)

* **Upload**: file input (`Firmware file (firmware.bin)`), `Version label (optional)`, optional `Note`; the button is disabled until a file is chosen. The label is optional because the firmware carries its own FIRMWARE_VERSION in the image and the API reads it (empty field: that label; none: `build-` + the start of the SHA-256; a typed label wins) - the field is not sent when empty. Sent as multipart (`useUploadFirmware`, a `FormData` built by a `bodySerializer`; the generated body type is bypassed with a cast). Nothing is installed by the upload.
* **Install on this Device**: per release, opens a `ConfirmDialog` where the **Device name must be typed**; then `PUT .../Firmware/Assign`. The dialog states that the Device learns of it with its next heartbeat and installs it within a minute or two and rolls back by itself within 10 minutes if the new firmware does not get online. Assigning an older release is a downgrade.
* **Delete**: per release, disabled for the assigned one (the API answers 409), confirmed in a dialog.

## Code

`src/api/hooks/firmware.ts` (`useDeviceFirmware`, `useUploadFirmware`, `useAssignFirmware`, `useDeleteFirmwareRelease`, `FIRMWARE_STATES`), `src/api/queryKeys.ts` (`firmware(deviceId)`), `src/api/schema.generated.ts` (regenerated from the local API), `src/lib/translations.firmware.ts` (Hungarian; registered in `translations.ts`; the translation test fails for a missing text). Tests: `FirmwareCard.test.tsx` (display, Reader sees no controls, install needs the typed name, multipart upload, delete rules, empty state).

## Rules

* The upload, the assignment and the delete are Company Admin operations on the server too; the card hides them for Readers anyway.
* The firmware log is device-supplied text: always rendered as text.
* No firmware byte is ever read or parsed in the browser: the SHA-256, the layout checks and the loader mark are checked by the API and the Device.

## Debug log card (2026-11-26)

On the Firmware page, below the Firmware card, an Admin sees the **Debug log** card (`DebugLogCard.tsx`, `useDeviceDebug` / `useSetDeviceDebug` in `src/api/hooks/deviceDebug.ts`): a duration (30 minutes, 1, 3 or 6 hours), **Switch on / Switch off**, **Download** (a .txt of the lines on screen) and **Clear the view**, a state badge (*On, N min left* / *Off*) and the console text of the Device (a scrolling `<pre>`, plain text, newest at the bottom). It polls `GET .../Debug?after=<last seq>` every 5 s while on (15 s while off) and collects the new lines (at most 1000 on screen; a new session or a restart of the numbering empties the view). **The Device only connects outwards**: it learns of the switch from its next heartbeat (about 30 seconds) and posts the text itself; the text is kept in the API's memory only (nothing in a database) and ends with the mode. Tests: `DebugLogCard.test.tsx`.
