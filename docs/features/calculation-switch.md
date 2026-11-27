# Per-Sensor calculation switch

The "Calculate" switch per Sensor on the Device page and what it means: data stored but not analysed (and left out of the model since 2026-11-19), the catch-up when it is switched back on, Recalc with calculation off only deleting, the "Calculation off" marking, and the import column. The Dashboard's Recalc UI is described here; the API side of recalculation is in the API's `recalculation.md`.

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/calculation-switch.md](../../../PRECOG_API/docs/features/calculation-switch.md).

> **2026-11-27 (the user's decision): the switch is the RAW calculation switch and lives on the Sensor's Policies page.** Read the older text below with these changes:
>
> - **Where:** the Policies page, on the raw level's card ("Actual · Native · Raw (raw)"), field **Calculate** (`RawCalculationDialog` confirms either direction; Admin only). The Device page's per-Sensor "Calculate" switch and `ProcessingDialog` are gone. Bulk: the **Calculate** column of Import Sensors (no separate button).
> - **What it governs:** the raw values only. Every aggregation level has its own switch and is evaluated independently.
> - **Wording:** the marking is "Raw calculation off" (`ProcessingOffPill`; the Recalc dialog and progress texts say raw). Live Monitoring uses "Calculation off" on a card that shows raw readings of a Sensor with nothing calculated.
> - **Smart Analytics:** the Sensor lists carry no mark any more; the **Aggregation** choice marks "Raw readings · Calculation off" (all chosen Sensors raw-off), like the levels (`AggregationSelect` `rawCalculationOff`, also in Live Monitoring's large window). The two-Device rows keep the mark on their raw row.
> - Tests: `RecalculateDialog.test.tsx`, `RecalculationProgress.test.tsx`, `AggregationSelect.test.tsx`, `SmartAnalyticsPage.test.tsx`, `LiveMonitoringPage.test.tsx`, `maintenance.test.tsx`.

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

## Catch-up in batches (API side; the dashboard only changed its wording) (2026-11-19, the user's decision: "the past too, in the accelerated mode")

- Switching calculation on (`RecalculationKind.CatchUp`) no longer evaluates the readings one by one: `RecalculationWorker.AnalyseInBatchesAsync` pages through the readings not evaluated yet (2,000 per page) and calls `AnalyseSignalDatabase(analysisUpTo = the page's last reading, analysisFrom = its first)` - the live analysis's own batches of 500 inside, exactly what the live analysis does when it catches up after a pause. `analysisFrom` keeps every query of a page from scanning the readings before it. A reading that cannot be analysed (no setpoint at its instant) is left as it is and does not stop the run. The Recalc button (`Recalculate`) stays one by one; the rebaseline (a changed maintenance kind) uses the same batch method. The existing tests "identical to the live analysis" pass unchanged with it.
- `AnalyseSignalDatabase` loaded EVERY analysed instant of the Sensor in each batch (`trulyAnalysedPeriods`), which made a long catch-up quadratic; it now loads only those inside the look-back's own time span.
- **Measured bottleneck - inside PredictionCalc.dll, fixed by its owner on 2026-11-19**: the time of one batch grew with the window (500 readings: ~2 s with an empty window, ~57 s with ~3,400) - per reading the cost was quadratic in the window (the stability rule evaluated Min / Max of the targets once per element). The owner fixed it in the Prediction repository (Min / Max once, the forecast-only sort only when a forecast is asked for, the mode and the duplicate-period check without GroupBy) - same results, every test against PredictionCalc unchanged. The API side no longer creates PredictionCalc's input objects per reading (`CalculatePredictionAsync` builds them once; a window is a slice). Measured on the test machine: a never-evaluated Sensor with 4,500 readings 14 s (before: not finished in 3 minutes), 12,000 readings 33 s (about 2.5 ms per reading with the full 10,000-reading window). Production estimate for AHU1 / KS4 / KS5 (526 Sensors, about 320,000 readings each, 10 Sensors at a time): roughly half a day, longer on a slower server. The new PredictionCalc.dll must be on the production host (`C:\Docker\API\Prediction\PredictionCalc\bin\Release\net8.0\`) before the API is deployed.
- Tests: `RecalculationTests.ASensorNeverEvaluated_IsCaughtUpInBatches_EveryReadingOverSeveralPages_WithoutAGapAtThePageBoundaries` (2,300 never-evaluated readings, every one but the first five analysed, no gap at the page boundary).

## Recalc of a listed set of Sensors (2026-11-20)

The Device-wide Recalc dialog (`RecalculateDialog`) has an optional field **"Only these Sensors"**: paste Sensor names one per line, or a sheet with a `SensorName` column (a Sensor import / export sheet can be pasted as it is; other columns are ignored; a name is the Sensor's external id or its display name, case insensitive; `parseSensorNameList` in `src/lib/recalculation.ts`). Empty = every Sensor, as before. With a list the dialog counts and names the listed Sensors ("The other Sensors of this Device are not touched"), an unknown name or an empty list blocks the button and is named under the field, and `useStartRecalculation(deviceId)` sends `POST .../Recalculate` with `{"sensorIds": [..]}` (API: see its `docs/features/recalculation.md`; 400 for an invalid list). Until `npm run gen:api` is run against the API that accepts the body, the body is passed past the generated type with a cast (`api/hooks/recalculation.ts`). Why: a Device-wide Recalc redoes every Sensor with calculation on, including the finished ones; a stopped or restarted Recalc is finished by listing only the Sensors that are not done. Tests: `recalculation.test.ts` (one name per line, the `SensorName` column, a tab separated paste, unknown and repeated names, empty), `RecalculateDialog.test.tsx` (the count follows the list, an unknown name blocks it, the POST carries the ids).

