# Permanent Device deletion and "Delete all data"

The Device page's Danger zone: "Delete device..." and "Delete all data...", both a two-step dialog (warning, then the Device name typed exactly) shared through `TypeNameConfirmDialog`.

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/device-deletion.md](../../../PRECOG_API/docs/features/device-deletion.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## Permanent Device deletion

The Device page's **Edit** card (Admin only) has a "Danger zone" with **Delete device...** (`DeleteDeviceDialog.tsx`, `useDeleteDevice` -> `DELETE /api/Devices/{deviceId}`). It is two steps on purpose: (1) a warning that lists what is destroyed and that it cannot be undone; (2) the user must **type the Device's name exactly** (case sensitive; the Device's name, or its external id when it has none - same rule as the API's `DeviceDeletionService.ConfirmationName`); the delete button stays disabled until it matches. The server checks the name again, refuses (409, shown inline) while training or an Ollama job runs, audits and logs the deletion, and the Dashboard then toasts the counts and returns to the device list. The old "no delete - disable only" rule applies to every other entity (Issues, categories, DevicePrincipals...), not to Devices.

## Delete all data of a Device

Next to "Delete device..." the Edit card's Danger zone has **Delete all data...** (`DeleteDeviceDataDialog`, `useDeleteDeviceData` -> `DELETE /api/Devices/{deviceId}/Data`). It is meant for clearing a device after testing: it removes every measured value of every Sensor (and the aggregation derived from it) **and the analysis built on it - all Issues, models and training requests** - and **keeps** the device, its Sensors and settings, credentials, access and the share configuration. The warning step says both what goes and what stays (and that devices receiving its shared knowledge are retrained), then the device name has to be typed exactly (same `TypeNameConfirmDialog` as the Device deletion; the server checks the name again). Afterwards telemetry, Issue and training queries are refetched and a toast reports the counts; the page stays open. The two-step typed-name dialog was extracted to `src/components/TypeNameConfirmDialog.tsx` and is shared by both actions.
