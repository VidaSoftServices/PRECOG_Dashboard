# Bulk Sensor import and Sensor sheets

The Device page's Sensor import (`SensorImportDialog`, `src/lib/sensorImport.ts`): a pasted Excel range or a CSV creates new Sensors and updates existing ones (only filled cells, only real differences), validates everything before the first request, runs sequentially with 429 / 401 / 403 handling, and can download the Sensor ID map. Also the ready-made 326-Sensor Vibration_Duo sheet and the "Export sensor for hardware" (firmware `sensor_map.h`) button. The sheet header rule (UpperCamelCase) stays in CLAUDE.md; the setpoint sheet and "Export all sensors" are in `setpoints.md`; the unit catalog and the Data sets workbook in `sensor-metadata.md`.

Related: the API has no doc of its own for this feature (Dashboard-only doc).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## Bulk Sensor import

A Device can have hundreds of Sensors (a dual-point vibration monitor publishes
163 KPIs per measuring point, 326 in all), which cannot reasonably be added one
dialog at a time. `DeviceDetailPage`'s **Import Sensors** button (Admin only)
opens `SensorImportDialog.tsx`:

- **Input**: paste cells copied from Excel (tab separated) or choose a `.csv`
  (comma, semicolon - what a Hungarian Excel writes - or tab, detected from the
  header). The first row is the header; column names are case-insensitive and
  tolerate spaces/underscores (`External Sensor ID`, `external_sensor_id`).
  Only the Sensor-id column is required: the template calls it `sensorName` (the Sensor's
  `externalSensorId`; `externalSensorId` and `machineName` are accepted as aliases). Optional: `displayName`
  (the Sensor's name; alias `name`), `direction`, `sensorType` (the Sensor's `sensorType`; alias `sensorType`),
  `unitCode`, `rawScale`, `rawLookback`, `rawMinIssueScore`,
  `Calculate` (the Sensor's `processingEnabled`), `Visible` (the Sensor's `visible` switch, see "Per-Sensor visible switch") and the setpoint columns below; for a **new** Sensor a
  missing column or empty cell takes the **dialog's default** (direction,
  scale, lookback, min issue score). Raw scale and raw lookback have no built-in
  default (as in the single "Add Sensor" form) - they come from the sheet or the
  defaults, never invented. "Download template" gives a ready CSV.
- **Setpoint columns (target / tolerance)**: `target`, `tolerance` for a lowerisbetter/higherisbetter
  Sensor (the template headers read `target (optional)`, `tolerance (optional)`, `targetAbove (optional)`, `targetBelow (optional)`, `toleranceAbove (optional)` and `toleranceBelow (optional)`; a trailing "(optional)" in any
  header is ignored, so both spellings import); `targetAbove`, `targetBelow`, `toleranceAbove`, `toleranceBelow` for a bidirectional one. A row that
  fills any of them gets a **Setpoint recorded right after its Sensor is created**
  (`POST .../Sensors/{sensorId}/Setpoints`, `validFrom` = the moment the import started - one instant for the
  whole run, open ended). That is the "default" target/tolerance: a Sensor with a setpoint is analysed from
  actual values alone. Rules, taken from what the API's calculation uses: a one-sided Sensor needs a `target`; a
  bidirectional one needs `targetAbove` and/or `targetBelow`, and a tolerance needs the target of its own side;
  a tolerance is never negative; the columns of the other direction are rejected (named by field); a decimal
  comma (`0,5`) is read as 0.5. A row without any value gets no setpoint and its Sensor is stored but **not
  analysed** until one is added on its Policies page (no default is invented). If a setpoint cannot be
  saved the Sensor stays created and the dialog lists it ("Setpoints not saved"); 429 waits `Retry-After`,
  401/403 stops the import.
- **A `sensorName` that already exists is UPDATED, not skipped** (`row.exists`, `existing` map of
  `importSensors`; the preview's Action column says New / Update). Only the **filled cells** are applied: an
  empty cell never overwrites, and the dialog's defaults are **not** applied to an existing Sensor (so scale,
  lookback and unit are not required for it). Three independent steps, each only when a value actually differs
  from what the API holds: (1) `PUT .../Sensors/{sensorId}` with the changed `name` / `sensorType` /
  `unitCode` / `direction` / `processingEnabled`; (2) the **raw/base aggregation policy**
  (`timeScale native` + `raw`; `GET .../AggregationPolicies`, then `PUT .../AggregationPolicies/{policyId}`)
  with the changed `rawScale` / `rawLookback` / `rawMinIssueScore`; (3) the **setpoint**: when a target or
  tolerance cell is filled the importer reads the setpoint effective now
  (`GET .../Setpoints/Effective`, 404 = none), merges the filled values over it (`mergeSetpoint`, pure and
  tested: a row with only a `tolerance` keeps the current target, the empty cells are carried over so the new
  interval is complete, only the columns of the Sensor's direction count) and records the result as a **new
  open-ended interval from the moment of the import** (`POST .../Setpoints`); the API ends the previous open
  interval at that instant, so history is kept and there is no overlap. Equal values write nothing
  ("already up to date"); a tolerance for a Sensor that has no target yet fails that row's setpoint with a
  clear message (the Sensor/policy steps that did apply stay applied). Because the current setpoint is only known
  when the import runs, the parser does not require a target for an existing Sensor's row (it does for a new
  one). The result lists every changed value ("rawLookback 100 -> 200", "target 5 -> 7"). Raw
  Lookback/Scale and `SensorType`/`UnitCode`/`Direction`/`Enabled` changes schedule retraining **on the server**,
  exactly as the same edits on the Policies page / Sensor dialog would; the import adds no warning of its own.
  Re-running a sheet is idempotent.
- **Validation is all-or-nothing before the first request** (`src/lib/sensorImport.ts`,
  pure and unit-tested): required/duplicate ids, direction, scale names, whole-number
  lookback, min score range and the API's column lengths. Problem rows are listed by
  sheet line; nothing is sent while any exists. A cap of
  1000 rows per import guards against a mistakenly pasted sheet.
- **No new API**: a new row is the same `POST /api/Devices/{deviceId}/Sensors` the
  single form uses (so each Sensor still gets its raw/base policy and the same
  server validation); an existing one uses the same `PUT` Sensor / `PUT` policy / `POST` setpoint calls as the
  Device and Policies pages. `isCurve` follows the Device's mode, never the sheet.
- **Sequential, in sheet order, by design** (`importSensors` in
  `hooks/sensors.ts`): the API gives each new Sensor the next Device-scoped id, so
  one-at-a-time creation makes the numeric ids follow the sheet's row order, keeps
  the request rate trivial (one request in flight), and lets one failing row not
  stop the rest. 429 waits the server's `Retry-After` and retries the row (4 times
  at most); 401/403 stops the whole import; a 409 "already exists" on create is a skip; **Stop**
  halts before the next row (what was done stays done). A progress bar shows
  `done / total`.
- **Download Sensor ID map**: after an import the dialog offers
  `externalSensorId,sensorId,name` for every sheet row that exists on the Device -
  the numeric ids a Device's firmware needs (its `sensor_map.h`), which otherwise
  have to be read off `GET .../Sensors` by hand.
- Ready-made sheets for the Vibration Duo device are in `samples/`
  (`vibration-duo-1-point-163-sensors.csv`, `vibration-duo-2-points-326-sensors.csv`),
  generated from that firmware's `docs/KPI_LIST.md`. Scale, lookback and min score
  are deliberately empty in them (the dialog defaults supply those); direction is a
  proposal (lower is better, shaft speed bidirectional) and units are UCUM where one
  exists (`[g]`, `mm/s`, `mm`, `Cel`, `/min`) and empty for the sensor's own
  energy units and the dimensionless kurtosis/crest factors. A test (`sensorImport.samples.test.ts`)
  keeps both files importable.

## Ready-made Vibration_Duo sheet (326 Sensors)

The ready-made Vibration_Duo sheet (it was generated once and handed over as a download; it is **not kept in `samples/`**) is the complete, ready-to-import sheet of the Vibration_Duo Device in the template's format: all 326 Sensors, generated from the firmware's own KPI list (`lib/precog_core/kpi_slots.inc`) and cross-checked against the API catalog (names, units, order). Order: measurement point 1 (the 162 KPIs, then `shaft_rpm_mean_1`), then point 2. Display name `{point}# {Display name}` (for example `1# Acceleration RMS X (equivalent RMS)`); direction `lowerisbetter`; sensorType `vibration` (RMS, kurtosis, crest, energy, band, spectrum), `temperature`, `rotation` (shaft speed); unit from the catalog; rawScale `Years`, rawLookback `100`, rawMinIssueScore `5`; Calculate `TRUE` except the two shaft-speed Sensors (`FALSE`); no setpoints. It needs no dialog defaults. The importer accepts it as it is (tested while generating it). Because the importer creates Sensors one by one in sheet order, an empty Device gets SensorIds 1..326 in the same order - the firmware's `include/sensor_map.h` uses exactly these (verify with "Download Sensor ID map" after the import).

## Export sensor for hardware (Device page; formerly "Export sensor_map")

Next to "Import Sensors" (Admin only) the Sensor list header has **Export sensor for hardware** (`ExportSensorMapButton.tsx`, `src/lib/sensorMap.ts`): it downloads `sensor_map-device-{id}.txt` containing exactly the text of the Vibration_Duo firmware's `include/sensor_map.h`, built in the browser from the Sensors that exist on the Device right now. One `#define PRECOG_SENSOR_ID_{EXTERNAL_SENSOR_ID_UPPERCASE} {id}   /* {externalSensorId} */` per firmware channel, in ascending id order, with the numeric Device-scoped id exactly as the API reported it (nothing is renumbered or guessed). A firmware channel is a catalog metric (`{machineName}_{point}`, from `GET /api/SensorMetadata`) of measurement point 1 or 2; any other Sensor (a custom tag, point 3, a name that only looks like one) is not a channel and is only listed in a comment ("Skipped"). A channel that has no Sensor is left out (the firmware's `sensor_map_defaults.h` keeps it 0 = unmapped) and counted/listed in the header ("No Sensor yet"). The file also carries the Device name, the generation time and the reminder that ids change when Sensors are deleted and re-created. The button is disabled while the catalog is loading or when the Device has no Sensors. Ids are not secret and nothing is sent anywhere. Tests: `sensorMap.test.ts` (326-channel round trip, real ids with gaps, missing and skipped Sensors), `ExportSensorMapButton.test.tsx`; checked in a real Chromium (download name and content).

## Dashboard additions of 2026-11-19 (overnight batch)

> One bullet of this CLAUDE.md section; the others are in `aggregation.md`, `live-monitoring.md`, `calculation-switch.md` and `smart-analytics.md`.

- **Device page**: each Sensor row shows its **External Sensor ID**; **Export all sensors** is inside the Import Sensors dialog; **Bulk aggregation** has an always-visible **Export current aggregations (CSV)** button.

## Faster import (2026-11-20)

`importSensors` (`src/api/hooks/sensors.ts`) no longer does everything one request after another:
- **Creations stay strictly sequential** (the API's next Device-scoped id must follow the sheet order, which the firmware mapping relies on).
- **Updates of existing Sensors run side by side**, at most 6 at a time (`UPDATE_CONCURRENCY`); the outcomes are still returned in sheet order and the progress count rises as rows finish.
- **Whole-Device reads:** with at least 5 existing rows (`BULK_READ_MIN_ROWS`) their raw policies come from one `GET /api/Devices/{deviceId}/AggregationPolicies` and their current setpoints from one `GET /api/Devices/{deviceId}/Setpoints/Effective`, instead of 2 reads per Sensor (only the part a row needs is read; a failed read falls back to the per-Sensor read). With fewer rows the per-Sensor reads are cheaper and stay.
- **A new Sensor's first setpoint** is saved in the background while the next Sensor is created.
- **429:** the requests share one gate (`RateGate` in `src/api/rateLimited.ts`): one rate-limited request makes all the others wait for its Retry-After too; retries are unchanged (4 times, at most 60 s). 401/403 and the Stop button stop everything.
Tests: `sensors.import.test.ts` (one read per Device, per-Sensor reads for few rows, concurrency <= 6 and sheet order, sequential creation with side setpoints, shared 429 wait), `SensorImportDialog.test.tsx`, `sensorExport.test.ts`.
