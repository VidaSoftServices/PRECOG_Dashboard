# Smart Analytics and Sensor / Device comparison

The Smart Analytics page: three modes (Single Sensor, Multi Sensor overlay of up to 4 Sensors, Compare Devices), the bounded paged range read (newest 20,000 readings per series), what is presentation-only arithmetic (average line), the two-Device comparison drawn in one chart with the live compatibility result as a notice, the Sensor filter and the enlargeable charts. Aggregation pickers and their fixes are in `aggregation.md`; the arrow-key stepping in `live-monitoring.md`.

Related: the API has no doc of its own for this feature (Dashboard-only doc).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## Smart Analytics

`SmartAnalyticsPage.tsx` — three modes (a radio group, **Single Sensor** by default): **Single Sensor**
(Device selection, exactly ONE Sensor chosen with a radio list, drawn with its full reference set), **Multi Sensor**
(one-or-more-Sensor selection, same-Device overlay with a checkbox list, capped at 4) and **Compare Devices**
(see below); the chosen Sensors are kept when switching between Single and Multi Sensor (back in Single Sensor the first stays).
Bounded wall-clock time range
(`DateTimeField` pair, start-before-end validated, both fields labeled with
the viewer's local zone), and two-Device comparison as a distinct mode.
Aggregation-policy metadata is shown as **reference information**, not a
query filter — the telemetry read endpoints expose no aggregation-level
selection parameter, so the page says so rather than inventing one. Issues
in the selected range are shown from the currently-loaded bounded Issue
list, explicitly labeled as a local filter over that bounded set, never
implying a full-history server search (see "Missing backend capabilities").
Backend-authoritative logic (anomaly, review state, category, similarity)
is always rendered from the API; the only presentation-only calculations
are the selected chart range, local Issue-list filtering, formatting, and the
**average line** of the two-Device comparison (the plain arithmetic mean of
exactly the readings that are plotted - `src/lib/seriesAverage.ts`; labelled
"average" in the legend and in the text summary, which also says over how many
points; it covers what was loaded when a long range was cut off).

**Range and loading.** Smart Analytics opens on the **last 15 minutes** (up to
now; `DEFAULT_RANGE_MINUTES` in `SmartAnalyticsPage.tsx`); a **Last 15 minutes** button returns to it after the page has been open
for a while, and the Start/End fields choose any other range. A Signal read is
made **page by page, newest first** (`useTelemetryDateRange` with `maxPoints`
and `readAllPages`: pages of 5000, `skip` = points already loaded, an empty page
ends the read), up to **20,000 readings per series** - a day of a 5-second
Sensor is about 17,300, so a whole day fits (the default window is only ~180
readings; the paging matters when a longer range is chosen). A longer range is cut off at its
OLDEST end and the page says so ("Newest 20,000 readings shown"). Before this a
single request of 2000 readings was made, i.e. only the newest ~2.8 hours of a
5-second Sensor. A very long series is drawn as a plain line (markers only for
anomalous points, no animation). Curve (periodic) reads are unchanged: one
request.

## Sensor and Device comparison

Same-Device Sensor comparison overlays up to 4 Sensors with distinct
color+line-dash pairs per series (never color alone). Two-Device comparison
draws the two chosen Sensors (one per Device) in **ONE chart, always** - the
series are labelled "Device · Sensor", so two Sensors with the same name stay
apart, and each carries its own unit label and direction. The live
`KnowledgeSharing/Compatibility` result is a **notice, not a gate**: an
unproven pair shows the API's exact rejection reason(s) ("Not proven
compatible", e.g. several source Sensors fit one target stream) and says that
the lines are drawn as selected and not converted or aligned; Sensors whose
unit codes differ additionally get a "Different units" notice, because both
lines then share one axis without conversion (compare the shape, not the
values). Before 2026-10-31 an unproven pair got two independent side-by-side
panels instead; that was dropped because a comparison is only useful with both
lines on the same axes, and the Admin picks the pair themselves. Nothing is
ever normalized or converted silently. Each of the two series also gets a
dashed horizontal **average** line (the mean of its plotted readings, in the
series' colour) and the platform's own **UCL3 / LCL3** control limits (the
values the analysis calculated and stored per reading, drawn in the series'
colour, only where the Sensor has them - calculation switched on, a setpoint is
not needed; no empty legend entries otherwise). The Single Sensor
view (and Multi Sensor with just one Sensor ticked) draws the API's full reference set like the enlarged Live Monitoring chart (`detailedLimits`: Target, Tolerance,
Actual, UCL3, UCL2, LCL2, LCL3 with the two shaded bands - Target/Tolerance only with a setpoint, the four limit lines always named in the legend and drawn only where the API stored values, with no notice about missing ones, the
Sensor's `direction` decides the tolerance side); with several Sensors (Multi Sensor mode) it stays a clean overlay without limit lines. See "Knowledge sharing" above for the
comparison-has-no-side-effects rule and the Admin-only transition link.

## Smart Analytics: Sensor filter and enlargeable charts

- **Filter**: the Sensor list of the Single and Multi Sensor modes has a filter box (`filterSensors` in `src/lib/sensorFilter.ts`, shared with Live Monitoring: case-insensitive match on name or externalSensorId, blanks around the text ignored). The list scrolls (max 156 px) instead of growing with hundreds of Sensors, and the status line under the box says "N of M Sensors match - selected: ...". The selection (up to 4) is kept when the filter hides a selected Sensor, so it is never silently dropped. In Compare Devices mode each Device's Sensor select has its own filter box; the currently chosen Sensor always stays among the options so the select never shows a value that is not an option.
- **Enlarge**: every Smart Analytics chart (the Single Sensor / Multi Sensor chart, the two-Device chart) is an `EnlargeableTelemetryChart` (`src/components/charts/`). Clicking the chart opens it in a modal window (95% of the window wide and a chart about 92vh - 200 px tall - larger than Live Monitoring's 85% modal, since a long-range analysis chart needs the room; `yy-MM-dd HH:mm:ss` time axis, 5x hover marker, Close / Escape), but a click on the **legend** still only toggles a series (`TelemetryChart`'s `onEnlarge` ignores clicks inside the legend box and shows a zoom cursor elsewhere). The keyboard and screen-reader route is the **Enlarge chart: {title}** button above each chart. These charts are not `compact`: their tooltip and legend toggling stay, unlike the small Live Monitoring cards. Checked in a real Chromium with a mocked API (80 Sensors: filter 80 -> 10, selection kept after clearing the filter, legend click does not open the modal, chart click and the button do).

## Dashboard additions of 2026-11-19 (overnight batch)

> One bullet of this CLAUDE.md section; the others are in `aggregation.md`, `live-monitoring.md`, `calculation-switch.md` and `sensor-import.md`.

- **Compare Devices**: the two Sensor selects are **linked by default** (a link icon between them): choosing a Sensor on one side chooses the one with the same external id (else the same name) on the other (`findSameSensor`); click the icon to unlink; the icon is light grey when the other Device has no such Sensor. The compare chart now draws, per Sensor and in the Sensor's colour, UCL3 / LCL3 (heavier, own dash per Sensor) **and Target / Tolerance** (`TelemetryChart` `showSetpoint`).

## Fixes of the same day, after the first use (2026-11-19)

> One bullet of this CLAUDE.md section; the others are in `aggregation.md` and `live-monitoring.md`.

- **Compare Devices**: "Not proven compatible ..." is no longer a highlighted bar above the chart; it is a plain note at the bottom of the page next to "This comparison view only visualizes data ...".
## Compare Devices: aggregation levels in the Sensor lists (2026-11-19)

- Each Device's Sensor select lists, for every Sensor, its own row (the raw readings, as before) and **one more row per aggregation level the Sensor has**, name and level in one row: `Vibration X`, `Vibration X · 1 day · Average`, ... (the level label as the other pickers write it, "Calculation off" marked; `rowsFor` in `DeviceComparisonAnalytics`). The row value is `sensorId` or `sensorId|level key` (`parseChoice`), so each side chooses a Sensor AND a level with one click; the Device-wide levels come from `useDeviceAggregationPolicies` of each Device.
- A side with a level draws the aggregated buckets of that level for the chosen range (`useAggregatedPoints`, the same widened range as the single-Device aggregation, re-read every 30 s) instead of the raw readings, with the reference lines the API returns with each bucket; its series label ends with the level ("Fan 1 · Vibration X · 1 day · Average"). The other side can stay raw, or have a different level.
- **Linked** (the default): choosing a row on one side chooses the same indicator on the other side and, when that Sensor has the same level (time scale + function), the same level - otherwise the raw readings. Linking again lines the right side up the same way. The filter boxes still filter by Sensor name; every matching Sensor keeps all its rows.
- Tests: `SmartAnalyticsPage.test.tsx` ("every Sensor row also exists once per aggregation level").
## Reference lines were invisible in comparisons of raw readings (fixed 2026-11-19)

- **Symptom**: in Smart Analytics the control limits (UCL3 / LCL3), Target and Tolerance were missing, always with raw readings, while an aggregation level showed them. **Cause** (in `TelemetryChart`, not in the API): the series of a comparison share one time axis, and two Devices never measure at the same second, so each series has empty places (nulls) between its own readings. The reference lines have no markers (`pointRadius: 0`) and Chart.js does not connect across a null by default (`spanGaps: false`), so each limit / target line fell apart into single points that cannot be seen. Aggregated buckets start at the same instants on both sides, so there were no gaps and the lines showed.
- **Fix**: every reference line (UCL3 / UCL2 / LCL2 / LCL3, Target, Tolerance, the per-series setpoint lines of a comparison) is drawn with `spanGaps: true`; the readings of a comparison (`mode === 'compare'`: Compare Devices and Multi Sensor) too, so each line runs across the other series' instants. A single series keeps `spanGaps: false` for its own readings, so a real gap in the data stays visible, but its reference lines run through it.
- A line is still drawn only where the API has a value: a Target / Tolerance only exists from the `validFrom` of the Sensor's setpoint (a range before it has none), and a Sensor with calculation switched off has no limits.
- Tests: `TelemetryChart.lines.test.tsx` (two series measured at different instants; one series with a gap).
## The Sensor filter searches the whole text of a row (2026-11-19)

- The filter boxes of Smart Analytics (the Single / Multi Sensor list and the two Device selects of Compare Devices) match against **everything a row shows**, not only the Sensor's name: the name, the direction and the "Calculation off" mark in the Single / Multi lists, and the aggregation level in the Compare Devices rows (`Vibration X · 1 day · Average`), plus the external id (`filterByLabel` in `src/lib/sensorFilter.ts`). **Every word** of the filter must be in the text, in any order, case-insensitive: `average day` finds the daily-average rows, `maximum` the maximum rows, `calculation off` the Sensors that are not calculated. An empty filter keeps everything.
- In Compare Devices the filter now filters the ROWS (name and level together), so typing a level leaves only the rows with that level; the chosen row always stays in the list (the select never shows a value that is not an option). Live Monitoring's filter is unchanged (name / external id, `filterSensors`).
- Tests: `sensorFilter.test.ts` (`filterByLabel`), `SmartAnalyticsPage.test.tsx` ("the filter box searches the whole text of a row").
