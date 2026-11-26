# Sensor maintenance mode, maintenance history and baselines

What the Dashboard shows and lets an Admin do about maintenance: the maintenance pill and warning bar for every level, the per-Sensor switch and, on the Device's Maintenance page, the all-Sensors switch (Admin only), the two-step end dialog that asks the maintenance kind, the maintenance history card with "Change kind" and "Start a new baseline", and the maintenance markers drawn on the charts.

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/maintenance.md](../../../PRECOG_API/docs/features/maintenance.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## The Maintenance page of a Device (2026-11-26)

The **Maintenance** button in the header of the Device page (every level; it replaced the Admin-only *Maintenance (all Sensors)* button) opens `/devices/:deviceId/maintenance` (`MaintenancePage.tsx`), which holds everything about maintenance of the **whole machine** (the user's decision, a UI change only):

* **All Sensors** card: "N of M Sensor(s) ... are in maintenance mode now" with the maintenance pill, one sentence on what maintenance does, and for an Admin one button that opens `MaintenanceAllDialog`; it is named after what can be done (*Start maintenance on all Sensors* / *End maintenance on all Sensors* / *Start or end on all Sensors…*).
* The **maintenance history** card (it moved here from the bottom of the Device page), with "Change kind" and "Start a new baseline" for an Admin, and the recalculation progress those two start.

Unchanged: the per-Sensor Maintenance / End maintenance buttons, the pills and the warning bar on the Device page ("N Sensors are in maintenance mode"). Where the sections below say the Device page for the all-Sensors switch or the history, this page is meant. Tests: `MaintenancePage.test.tsx`.

## Sensor maintenance mode

A Sensor in maintenance mode has every value its Device sends **accepted but
ignored** by the API - not stored, not analysed - so a machine being serviced
cannot raise false Issues. Data sent meanwhile cannot be recovered.

- **Any level reads it.** `SensorDto.maintenanceMode`/`maintenanceSince` come
  with `useSensors`, so Admin and Reader both see the `MaintenancePill`
  (icon + text, never color alone) on the Device detail page's Sensor list, a
  page-level warning `MessageBar` counting the Sensors in maintenance, and on a
  Live Monitoring card - where it replaces the `FreshnessPill`, because a
  Sensor ignored on purpose must not read as a silent ("stale") one.
- **Only an Admin changes it.** `DeviceDetailPage` renders the
  "Maintenance"/"End maintenance" button for `isAdmin` only, through the shared
  `ConfirmDialog` (starting is destructive-styled and says the data is lost).
  `useSetSensorMaintenance` sends `PUT .../Sensors/{sensorId}/Maintenance` with
  `{ enabled }` (ending also sends `kind` and `note`, see "Maintenance history, maintenance kind and baselines"). **A Device can never change maintenance mode** - not even
  for a person whose phone's MAC address is registered to an Admin: the API
  lets a Device only read the state, so someone using a phone on a Device sees
  it but modifies nothing. The control being hidden from a Reader is a UX
  convenience; the server answers any non-Admin with 403
  `You need admin privileges to set maintenance mode.`
- Maintenance is an operational state, distinct from `Sensor.enabled` and from
  configuration: it never triggers retraining and changes no Policy.
- **All Sensors of the Device at once.** The Sensors header of the Device page has an
  Admin-only **Maintenance (all Sensors)** button (`MaintenanceAllDialog`,
  `useSetDeviceMaintenance` -> `PUT /api/Devices/{deviceId}/Maintenance` `{ enabled }`): ONE
  request switches every Sensor of the Device on or off (a Device such as the
  Vibration_Duo has 326 Sensors and the per-Sensor call is rate limited to 30 per minute, so a
  loop of per-Sensor calls is not an option). The dialog says how many Sensors are in
  maintenance now and offers two choices - **Start** on every Sensor that is not in maintenance
  yet, **End** on every one that is - and disables a choice that would change nothing; with
  nothing (or everything) in maintenance the only sensible choice is preselected, with a mix none
  is. **Starting** shows the same data-loss warning as the single-Sensor dialog and needs an
  explicit acknowledgement checkbox before the destructive confirm button enables; ending needs
  none. Sensors already in the requested state are left untouched by the API (their start time
  and Admin are kept); the change is one audit event on the server. A success toasts the
  number of Sensors changed and refreshes the Device's Sensor queries (the per-Sensor
  buttons, pills and the warning bar follow). A non-Admin never sees the button, and the server
  answers 403 anyway (shown inside the dialog, which stays open).
- Live Monitoring still polls a Sensor in maintenance (it shows its last stored
  values); it is not removed from the rotation.

## Maintenance history, maintenance kind and baselines (2026-11-19)

Why (the user's decisions): after a repair the machine runs better, and the old readings keep the control limits wide, so a new fault shows late. The API now keeps a **maintenance history** and **baseline segments** (see the API's CLAUDE.md "Maintenance history and baseline segments"); the dashboard asks what a maintenance was, shows the history and marks maintenances on the charts.

- **Ending a maintenance** asks what it was, in two steps (`EndMaintenanceDialog`): (1) **Replacement or repair** (the normal state changed: a new baseline starts; during a warm-up - raw 1 day, hourly 3 days, daily 14 days, weekly 8 weeks, monthly 6 months - the readings are still measured against the old baseline, so a repair that went wrong shows) or **Minor maintenance** (the baseline stays), plus an optional note (500 characters); (2) a confirmation that says what happens and needs a checkbox. The single-Sensor "End maintenance" uses it; "Maintenance (all Sensors)" asks the same kind, note and checkbox inline when ending. Sent as `{ enabled: false, kind, note }` (`useSetSensorMaintenance` / `useSetDeviceMaintenance` now take `{ enabled, kind?, note? }`); starting is unchanged.
- **Maintenance history card** (`MaintenanceHistoryCard`, Device page under the Sensor list; every level reads it, `useMaintenanceHistory` = `GET .../Maintenances?take=500`, one read shared with the chart markers): Sensor filter, start -> end, kind badge (icon + text), baseline state (Warm-up with the raw warm-up end / Current baseline / Earlier baseline), note. Admin only: **Change kind** on any finished maintenance, however far back (`ChangeMaintenanceKindDialog`: the API's preview - recalculated span "end -> now", raw readings or why not, the levels, later baselines (their kind stays), the Issues in the span as links - and a checkbox; `PUT .../Maintenances/{id}`; the Sensor is recalculated from the maintenance's end, shown by the Device's recalculation progress as "Recalculating with the changed baseline"; **no Issue is deleted** - the Admin reviews them) and **Start a new baseline…** (`StartBaselineDialog`: all Sensors or one, an instant - now by default, a past one recalculates from there - a note and a checkbox; `POST .../Maintenances/Baseline`).
- **Chart markers** (`TelemetryChart` `maintenances`, built by `maintenanceMarkers` in `src/lib/maintenanceMarkers.ts`, drawn by the chart's `maintenanceMarkers` Chart.js plugin): a **blue dashed vertical line** per finished maintenance of the shown Sensors (long dashes: replacement / repair, short dashes: minor), labelled at the top ("Replacement", "Minor maintenance", "New baseline"); when the maintenance's hours are visible a line at its start and end with a light band between; after a replacement the **warm-up of the level shown** (from the API's `warmUps`: raw, or the chosen aggregation level) is shaded light blue. The text summary lists them and a legend line explains them. Positions are interpolated between the chart's instants (category axis); a maintenance outside the plotted range is not drawn. Used by Smart Analytics (Single / Multi Sensor - each Sensor's own level - and Compare Devices, each Device's own history), the enlarged Live Monitoring chart (read only while it is open) and the Issue detail chart; not on the small Live cards.
- Not built: a tooltip on the line itself (the summary text carries the dates); BiSignal / periodic Sensors get markers but the API has no baseline segments for them.
- Tests: `maintenanceMarkers.test.ts`, `MaintenanceHistory.test.tsx` (two-step end dialog, history card Admin / Reader, kind change with preview and PUT body), `MaintenanceAllDialog.test.tsx`, `maintenance.test.tsx`. Checked in a real Chromium (a temporary page rendering the chart with three markers): lines, labels, warm-up bands and the summary, no page error.
