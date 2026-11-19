# Per-Sensor calculation switch

The "Calculate" switch per Sensor on the Device page and what it means: data stored but not analysed (and left out of the model since 2026-11-19), the catch-up when it is switched back on, Recalc with calculation off only deleting, the "Calculation off" marking, and the import column. The Dashboard's Recalc UI is described here; the API side of recalculation is in the API's `recalculation.md`.

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/calculation-switch.md](../../../PRECOG_API/docs/features/calculation-switch.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## Per-Sensor calculation switch

By default every accepted batch triggers calculation for each Sensor in it (the
API's analysis pipeline: scoring, Issue detection, summaries). `SensorDto.processingEnabled`
(default true) lets an Admin turn that off for one Sensor: its data is **still
stored, but is NOT part of the model any more (changed 2026-11-19: the API leaves it out of the training and the switch schedules retraining; before, training read the stored values, not
the analysis), but new values trigger no analysis and so no Issue from that Sensor.
Meant for Sensors that should feed the model without ever raising an Issue of their own.

- **Device detail, Sensor list**: an Admin sees a "Calculate" `Switch` per Sensor
  (`ProcessingDialog` confirms either direction through `ConfirmDialog`; turning off is
  destructive-styled); every level sees the "Calculation off" `ProcessingOffPill` (icon +
  text) on a Sensor that is switched off. The pill renders nothing for a calculating
  Sensor, so the common case stays quiet.
- Changed with `PUT .../Sensors/{sensorId}` `{ processingEnabled }` through the existing
  `useUpdateSensor`. The server audits it and does **not** treat it as retraining-relevant, so
  the dashboard shows no retraining warning for it.
- **The switch decides what is calculated (2026-11-18, the user's decision; before, switching on
  never scored the backlog).** Switching back on makes the API calculate everything that was not
  calculated - the values stored while it was off, or deleted by a Recalc with calculation off -
  in a background **catch-up**, one value at a time in time order, exactly as the live calculation
  would have done (control limits, anomalies, Issues; reviewed Issues kept and not duplicated).
  Its progress is the Device's recalculation progress (`kind: 'CatchUp'`, "Catching up: N %"), so
  `useUpdateSensor` (when `processingEnabled` is sent) and the import refresh that query. A
  bidirectional Sensor or one in maintenance is calculated from the switch-on moment only. The
  confirm dialog says all this. An Issue already open when the switch is turned off is left as it is.
- **Recalc with calculation off only deletes**: the calculated values and the unreviewed Issues
  go, nothing is calculated, the aggregation levels are left alone - for example to free the space
  of a Sensor that will not be calculated (`isDeleteOnly`, `src/lib/recalculation.ts`; the dialog
  reads "Delete the calculated values of ...?"; Device-wide it says how many are only deleted from).
  Only maintenance mode disables Recalc now.
- Distinct from maintenance mode (which also discards the data) and from `enabled`.
- **Import**: the sheet has an optional `processingEnabled` column (true/false, 1/0, yes/no,
  on/off, igen/nem), and the dialog has a "Calculation" default for rows that leave it empty -
  so a 163-row sheet can mark only some Sensors as "store, don't calculate (and keep out of the model)".

## Dashboard additions of 2026-11-19 (overnight batch)

> One bullet of this CLAUDE.md section; the others are in `aggregation.md`, `live-monitoring.md`, `smart-analytics.md` and `sensor-import.md`.

- **Calculation-off Sensors are marked with the text "Calculation off" only** (Live card: the pill; Smart Analytics lists and the compare selects: the suffix). They were first drawn grey; the user took that back the same day (nothing is greyed). Hidden (Visible = false) Sensors were never shown in Smart Analytics and still are not.
