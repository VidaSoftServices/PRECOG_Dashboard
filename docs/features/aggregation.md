# Aggregation levels, aggregation engine and Device time zone

The Dashboard side of aggregation levels: the "New aggregation level" form (dropdowns only, data key fixed to Actual), the Bulk aggregation dialog and its CSV, minimum evaluation, the Device time zone select, the per-level Calculate switch, and the aggregation pickers of Live Monitoring's large window and Smart Analytics (with the same-day fixes). The raw/base policy and the per-level Lookback / Scale / MinIssueScore ownership are cross-cutting and stay in CLAUDE.md ("Device and Sensor configuration").

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/aggregation.md](../../../PRECOG_API/docs/features/aggregation.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## "New aggregation level": dropdowns only, data key fixed to Actual

The Sensor Policies page's **New aggregation level** form (`NewPolicyForm` in `SensorPoliciesPage.tsx`, options in `src/lib/aggregationOptions.ts`) no longer has any free-text field for what the system already knows:

- **Source data key is gone** from the form and always sent as `Actual`: only measured values are aggregated. The API still accepts the other DataKeys (Analysed, Anomaly, control limits); nothing in the dashboard needs them. **Target and tolerance are not aggregated at all**: they are setpoint configuration, and for each time slice the setpoint that was in effect for the **larger part of the slice** applies (decision for the API side, see the API's CLAUDE.md "Setpoint of an aggregated slice").
- **Time scale**, **Aggregation function**, **Scale** and **Time zone** are dropdowns. Time scale: 16 scales from 15 seconds to 1 year (15 s, 30 s, 1 min, 15 min, 30 min, 1 h, 4 h, 12 h, 1 d, 3 d, 1 w, 2 w, 1 / 3 / 6 months, 1 year; the API also knows 1 ms and 1 s, which are not offered), never Native. 15 seconds (`Seconds15`, id 18) and 12 hours (`Hours12`, id 19) were added to the API's TimeScale enum and seed data for this; an existing database needs the API's one-off `DB_TimeScales_Add_15s_12h.sql` first, otherwise creating such a level fails. Aggregation function: every API function (AVG, TIME_WEIGHTED_AVG, MIN, MAX, RANGE, MEDIAN, MODE, RMS, P95, P99, FIRST, LAST, DELTA, SUM, INTEGRAL, COUNT, STDDEV, VARIANCE, SLOPE, CHANGE_COUNT, COUNTER_INCREASE), never Raw (Raw/Native/Actual is the raw level the API creates with the Sensor). Scale: the set the Sensor forms and the import already use. Time zone: UTC (default, first) and the IANA names the browser reports (`Intl.supportedValuesOf('timeZone')`), with a short fallback list when a browser lacks it. The values sent are the API's own enum names, which it parses case-insensitively.
- The lists live in the dashboard (the API has no lookup endpoint for them); when the API gets a new time scale or function, add it to `aggregationOptions.ts`. Tests: `NewPolicyForm.test.tsx` (no data-key field, only dropdowns, the request body, no Native/Raw, unique values).

## Device time zone and minimum evaluation (2026-11-19)

- **Device time zone**: the Device page's Edit card has a **Time zone** select (`timeZoneOptions(current)`, UTC and Europe/Budapest first; default Europe/Budapest, `DeviceDto.timeZone`); it is sent with `PUT /api/Devices/{id}` only when changed (the API then re-aggregates all levels of the Device in the new zone; the toast says so). The Status card shows it. **No time zone anywhere else**: the "New aggregation level" form, the Bulk aggregation dialog and the aggregation CSV have none any more (the API ignores one); an old CSV's `timeZone`/`tz` column is read and silently dropped.
- **Minimum evaluation (%)** (`minEvaluationPercent`, 0-100, default 10; `DEFAULT_MIN_EVALUATION_PERCENT`): field in the New level form, the Bulk dialog and the level card on the Policies page (non-raw levels only; Save is disabled for a value outside 0-100); CSV column `minEvaluation` (replaces `timeZone` in the header, export and sample; optional, empty = API default). The three prepared sheets in Downloads were rewritten accordingly (backups in the session scratchpad) and checked with the real importer against the production Sensor names.
- Tests: `aggregationSheet.test.ts`, `NewPolicyForm.test.tsx`, `BulkAggregationDialog.test.tsx`; whole suite 598 pass. `schema.generated.ts` was regenerated from the API's OpenAPI document (dumped by a temporary test, as before).

## Dashboard additions of 2026-11-19 (overnight batch)

- **Aggregation pickers.** The Live Monitoring large window has an **Aggregation** select at its top right (before Refresh / Close): "Raw readings" or one of the levels the Sensor has (`AggregationSelect`, `levelsOfSensor`); with a level chosen the chart draws the newest 100 buckets (value at the bucket START, `useAggregatedPoints`, re-read every 15 s) without limits/target, and the big number shows the newest bucket. The choice stays while the arrow keys move between Sensors. **Smart Analytics** shows the select right after the Device (Single and Multi Sensor mode, only when the Device has a level) and also in its large window; with a level chosen each selected Sensor draws its buckets for the chosen range (a Sensor without that level is listed in a notice). The levels come from one Device-wide request (`useDeviceAggregationPolicies`, kept a minute). Aggregated buckets have no target/tolerance/limits (the API's evaluation lives on the level, not in the reading), so only the value is drawn.

> The bullets "Arrow keys in a large window", "Calculation-off Sensors are marked ...", "Compare Devices" and "Device page" of this section are in `live-monitoring.md`, `calculation-switch.md`, `smart-analytics.md` and `sensor-import.md`.

- Tests added or changed: `aggregationLevels.test.ts`, `sensorLink.test.ts`, `SmartAnalyticsPage.test.tsx`, `LiveMonitoringPage.test.tsx`, `BulkAggregationDialog.test.tsx`. Not built: the aggregation of the two-Device comparison.

## Fixes of the same day, after the first use (2026-11-19)

- **Aggregation in Smart Analytics returned nothing**: the Values endpoint returns the buckets whose START lies in the range, and the default range is the last 15 minutes - no day starts in it. The read now starts one bucket before the range and at least 60 buckets back (`aggregatedRange`, a note says so when it was widened).

> The bullet "Up / Down in a large window" of this section is in `live-monitoring.md`.

- **The chosen aggregation follows the arrow keys**: a Sensor that lacks that very level gets the closest one by bucket length (`pickLevel`, `LevelPreference`).
- **An aggregated chart has the same reference lines as a raw one** (Target, Tolerance, UCL3 / UCL2 / LCL2 / LCL3, the two bands): the API now returns them with each bucket (`includeReference`), `bucketToPoint` maps them, and the Live window and Smart Analytics draw them with `detailedLimits`.

> The bullet "Compare Devices" of this section is in `smart-analytics.md`.

- Tests: `aggregationLevels.test.ts` (`pickLevel`, `aggregatedRange`), `SmartAnalyticsPage.test.tsx`.

## Calculation switch per aggregation level (2026-11-19)

- `SensorAggregationPolicyDto.calculationEnabled`: false = the level is only aggregated (to look at), never evaluated (no anomaly, no Issue). Set in the New level form and on each level card of the Policies page (**Calculate** switch), in the Bulk aggregation dialog (create mode) and by the aggregation sheet's optional **`calculate`** column (true/false, 1/0, yes/no, on/off, igen/nem; default true; aliases `calculation`, `calculationEnabled`; exported by "Export current aggregations"). The aggregation pickers (Live window, Smart Analytics) mark such a level "Calculation off".
- Tests: `aggregationSheet.test.ts`, `BulkAggregationDialog.test.tsx`, `NewPolicyForm.test.tsx`.

## Permanent deletion of aggregation levels (2026-11-19, the user's decision: no soft deactivation)

- **`DeleteAggregationLevelsDialog`** (one dialog for every place): the API's preview first (`useAggregationLevelDeletionPreview` -> `POST .../AggregationPolicies/DeletionPreview`): levels deleted, aggregated buckets, the Issues of these levels (and how many are reviewed: training examples, their deletion schedules retraining), the refused levels with the API's reason (raw, in a knowledge share, an Ollama job busy, not found); "This cannot be undone"; an explicit checkbox enables the destructive button (`useDeleteAggregationLevels` -> `POST .../AggregationPolicies/Delete` with `confirm: true`). A success toasts the counts and refreshes the levels, Sensors, Issues and training requests.
- **Policies page**: a level card's "Deactivate" became **Delete permanently…** (not for the raw level).
- **Bulk aggregation**: "Deactivate the level" became **Delete the level permanently** (time scale + function for all or chosen Sensors), and **Delete from CSV** is new: a sheet with `SensorName, TimeScale, AggregationFunction` (`AGGREGATION_DELETION_SHEET_HEADERS` = `SensorName, Level, TimeScale, AggregationFunction`; every other column is ignored, so an aggregation sheet or an export works as it is), parsed by `parseAggregationDeletionSheet` (`src/lib/aggregationSheet.ts`; raw level, unknown Sensor, missing column, a level listed twice = problems, nothing is sent while any exists). Both open the dialog above.
- The prepared `delete-aggregation-AHU1/KS4/KS5.csv` (Downloads) are such sheets: the levels production has that the new `aggregation-*.csv` do not (see the API's aggregation doc for the reasoning of the sixth version).
- Tests: `aggregationDeletionSheet.test.ts`, `BulkAggregationDialog.test.tsx` (delete mode: preview, checkbox, the request body; delete from CSV).

## Anomaly of a bucket on the chart (2026-11-19)

`GET .../AggregationPolicies/{policyId}/Values` now returns `anomaly` per bucket (0 / 1 warning / 2 critical, null = not evaluated); the Dashboard's `bucketToPoint` passes it to the chart, which draws an anomalous bucket with a large yellow / red marker like a raw reading (`smart-analytics.md`, "Anomaly markers on the charts").

- 2026-11-27 (the user's rule; replaces the 2026-11-25 "Device ID" version): every downloaded file about a Device ends with the Device's **name** after the number, e.g. `aggregation-device-1-Test_Device.csv`, `sensors-device-2-KS4.csv` (also setpoints, descriptions, the Sensor ID map and "Export sensor for hardware"). `deviceFilePart` (`src/lib/deviceFileName.ts`): letters (accented too), digits, `.`, `_`, `-` stay, anything else becomes `_`, at most 60 characters; an unnamed Device uses its Device ID. The two empty templates keep their fixed names.

## The raw switch next to the levels (2026-11-27)

The raw level's card on the Policies page has its own **Calculate** field (`Sensor.processingEnabled`, see `calculation-switch.md`); each level's Calculate is independent of it.
