# Live Monitoring

How the Live Monitoring page keeps the Sensors on screen fresh without breaking the API's per-IP `LargeTelemetryRead` rate limit: since 2026-11-02 one batched request every `POLL_INTERVALS_MS.liveMonitoringCycle` (5 s) for every shown Sensor (the older one-Sensor-per-tick rotation is kept below for its reasoning), the shared 429 cooldown, the filter / paging / manual refresh, the small card charts and the enlarged chart window (with its own single-Sensor read that carries the control limits).

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/live-monitoring.md](../../../PRECOG_API/docs/features/live-monitoring.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## Live Monitoring

> **SUPERSEDED in part (2026-11-02): one batched request every 5 seconds.** What follows describes the earlier design - a round-robin that
> fetched ONE Sensor per tick - and is kept for its reasoning (rate limit, 429 handling, the `fetchQuery` overrides). **What changed:**
> the API now has `GET /api/Continuous/MeasuredTrailingPeriodsBatch` (`deviceId`, `sensorIds` repeated, `endDate`, `periods`: the newest
> readings of SEVERAL Sensors of one Device as one flat list, one request for any number of Sensors, read with one SQL statement - see the API's CLAUDE.md,
> "Batched trailing read", for the production incident behind it). `useLiveMonitoringSchedule.ts` therefore makes **ONE request per
> `POLL_INTERVALS_MS.liveMonitoringCycle` = 5 s for EVERY Sensor on screen** (the filtered, shown, non-curve Sensors of the current page: 10 /
> 25 / 50), not one request per tick for one Sensor. That is **12 requests a minute whatever the number of Sensors - a tenth of the
> `LargeTelemetryRead` budget** (240 per 120 s per client IP), where the rotation used 60/min at its last 1 s setting. There is no
> per-Sensor rotation, `nextRotationIndex`, "each one about every N s" or sequential "Refresh shown" any more:
> - `fetchAndCacheTelemetryTrailingBatch` (`telemetry.ts`) sends the one request for the Signal Sensors and writes each Sensor's readings,
>   **oldest first**, into the very query its card subscribes to (`useTelemetryTrailingPeriods`' key), through one shared promise per
>   Sensor's `fetchQuery` (`retry: false`, `staleTime: 0`), so every card keeps its own data / loading / error state and a failure or a 429
>   reaches all of them; a Sensor without data gets an empty list. A **bidirectional** Sensor (a different table, no batch endpoint yet) is
>   still read one by one in the same cycle; curve Sensors are never fetched.
> - **Oldest first is also a fix**: the API returns the readings newest first and the card takes the last element as "the latest reading",
>   so before it showed the oldest of its 20 readings (about 100 s old). `normalizeTrailing` puts them in time order.
> - The schedule is the **sole** requester: a self-rescheduling `setTimeout` (never `setInterval`), never two requests in flight, a 429 starts
>   the one shared cooldown (`Retry-After`, bounded fallback backoff), paused when the tab is hidden or the switch is off. A manual refresh
>   (the circular arrow of a card, "Refresh shown", the modal's refresh icon) is **one batched request for the Sensor(s) asked for**; it waits
>   for a scheduled request already on its way, a second manual refresh is ignored while one runs, and a 429 starts the same cooldown.
> - **A cancelled request is not a failure**: when the schedule restarts (a page / filter / Device switch, an unmount - React StrictMode does it on every mount in development) the shared request is aborted, and `fetchAndCacheTelemetryTrailingBatch` rethrows the abort WITHOUT touching any card's query; before this every card stored the `AbortError` as its own error ("Couldn't load this ... signal is aborted without reason"). Only a real failure (429, 500, network) is written into the cards' queries, and a success with `setQueryData`.
> - The switch reads **"Refresh every 5 seconds"** (the number comes from the constant). The enlarged chart still reads the card's data.
>   The state names changed: `manualSensorIds` (replaces `manualSensorId`), no `activeSensorId`, no `manualProgress` ("Refreshing…").
> - Tests: `useLiveMonitoringSchedule.test.tsx`, `telemetry.trailingBatch.test.tsx`, `LiveMonitoringPage.test.tsx` (one request with the Sensors as
>   a parameter, no per-Sensor request, the newest reading is the latest, the switch text, the card's refresh asks for that one Sensor).
> The rate-limit and 429 reasoning below still applies; ignore every number that says one Sensor per tick or 3 s.

The supported mechanism is **bounded polling of `MeasuredTrailingPeriods`**
— there is no push/SSE/WebSocket capability anywhere in the API, confirmed
during the original assessment, and none is invented here. At the time of that audit no batched
multiple-Sensor endpoint existed (every read was one Sensor at a time); `MeasuredTrailingPeriodsBatch` was added on 2026-11-02, see above.

**The rate-limit ceiling this page must live inside, confirmed from
read-only backend source, not assumed**: `MeasuredTrailingPeriods` on both
controllers carries `[EnableRateLimiting("LargeTelemetryRead")]`, a fixed-window
limiter partitioned **per client IP** (`appsettings.json`'s `RateLimiting`
block) — **240 requests per 120 seconds (120/min on average), `QueueLimit: 0`**
(an over-limit request is rejected immediately, not queued). That is the
doubled value: `appsettings.json` carried 120 per 120 s before the API's
rate limits were doubled, and earlier revisions of this document still quoted
a stale 30 per 60 s. Per-IP partitioning means every browser tab and every
dashboard page sharing that network shares one 240/120s budget — this page
cannot assume it owns the whole budget. On
rejection the API's `OnRejected` handler sets a genuine `Retry-After`
header (confirmed in `Program.cs`) — this frontend must read and honor it,
never treat a 429 as an ordinary retryable network error.

**A separate, unrelated "1024" value must never be confused with this
limit or with connection-pool capacity.** It's PostgreSQL's
`max_locks_per_transaction`, set via `ALTER SYSTEM SET
max_locks_per_transaction = 1024;` (`DataAccess/DBScripts/DB_Partitions.txt`)
— a per-transaction lock-table sizing knob for this database's heavy use of
declarative partitioning, with no relationship whatsoever to how many HTTP
requests per minute the API accepts or how many Postgres connections it
holds open. The Npgsql connection pool (`MaxPoolSize: 40`,
`appsettings.json`'s `Database` block) is itself architecturally
independent of `LargeTelemetryRead` — confirmed via an explicit comment in
`Program.cs` stating the two are unrelated by design. **Greater database or
connection-pool capacity is never a justification for this frontend to
fire an uncontrolled volume of HTTP requests** — the rate limiter, not the
database, is the ceiling this page is built against.

`LiveMonitoringPage.tsx` + `useLiveMonitoringSchedule.ts` (the orchestrator):

- **One single logical refresh cycle, never a per-Sensor `setInterval`.**
  `POLL_INTERVALS_MS.liveMonitoringCycle` (`src/lib/pollIntervals.ts`) is
  the **only** place the 3-second cadence is defined — a self-rescheduling
  `setTimeout` loop (not `setInterval`, so a slow tick can never stack a
  second one on top of itself) advances a round-robin rotation through the
  Device's non-curve Sensors, fetching **exactly one Sensor per tick**, in
  order, wrapping around. Peak concurrent Live-Monitoring-originated
  request count is **1, by construction** — not a "2-4 concurrent" bounded
  pool, which the math below shows would already blow the budget on its
  own.
  - **The math, not a guess**: 25 Sensors × 1 request/tick × 20
    ticks/minute (3s cadence) = **20 requests/minute sustained**, about 17% of
    the confirmed 240/120s (120/min) ceiling — a wide margin left for every
    other page and every other browser tab on the same client IP. A naive
    "2-4 concurrent" scheme would be 40-80 req/min on its own (a third to two
    thirds of the whole budget) before anything else on that IP is counted.
    The cadence was deliberately not raised when the API's limits were doubled.
  - A consequence, stated honestly in the UI, not hidden: with 25 Sensors
    on one 3s cadence, any single card's own "last refreshed" is roughly
    `sensorCount × 3s` apart (~75s for 25 Sensors), not literally every 3s
    — `LiveMonitoringPage.tsx`'s status line states this explicitly, and a
    Sensor whose turn hasn't come up yet shows an honest "Waiting for first
    refresh…" state rather than a spinner that never resolves or a stale
    value silently relabeled as live.
  - **Multiple browser tabs share one budget, not one each** — the rate
    limiter partitions per client IP, not per tab or per session. One tab on
    a 25-Sensor Device already uses 20/120 req/min (17%); a **second**
    concurrent tab on the same network (a second Device, or the same one)
    adds another ~20 req/min, for ~40/min combined — still under the
    ceiling, but several tabs add up, and
    the shared cooldown this page implements is itself per-tab (each tab
    runs its own orchestrator instance), so one tab's 429 does not pause
    the other's schedule. This is a real, known limit of the current
    design, not something this pass silently papered over — a genuine fix
    (e.g. a `BroadcastChannel`-coordinated single shared schedule across
    tabs) is future work, not built this pass.
- **429 handling is centralized, not per-Sensor.** A 429 sets a single,
  shared `cooldownUntil` on the orchestrator; the schedule stops entirely
  (no further ticks, no per-Sensor retry timers) until the server's
  `Retry-After` elapses, then resumes with exactly one controlled tick — a
  repeated 429 with no `Retry-After` falls back to a bounded exponential
  backoff (`computeFallbackBackoffMs`, capped at 60s). Existing good data
  stays visible throughout — a cooldown never blanks the page.
  `RateLimitBanner` (one page-level `MessageBar`, `role="status"`) is the
  single place this is shown; `notifyGlobalFailure` (`queryClient.ts`)
  still surfaces at most one global toast per failure via the query cache's
  own `onError`, which is complementary, not duplicative — the banner
  persists for the cooldown's duration, the toast is transient — and
  neither fires once per Sensor.
- **The orchestrator is the sole authority over retry and freshness for
  this one polling path** — `fetchAndCacheTelemetryTrailingPeriods`
  (`telemetry.ts`) explicitly passes `retry: false` and `staleTime: 0` to
  its `queryClient.fetchQuery(...)` call specifically because
  `queryClient.ts`'s sensible **global** defaults (retry a 429 once
  internally; 15s `staleTime`) are wrong here and were each a confirmed
  live bug before being overridden: the global retry silently issued a
  *second* real request for the same Sensor moments after its first 429,
  defeating the shared cooldown; the global staleTime silently served
  cached data with zero network traffic whenever the rotation restarted
  (pause/resume, route away/back) within 15s of that Sensor's last real
  fetch, making the page appear "stuck." Both were only visible in a real
  mocked-browser run, never in a fake-timer unit test that mocks this
  function away — see `TASK_IMPLEMENTATION.md`'s decision log for the full
  incident. Every other `useQuery` in the app is unaffected and keeps the
  global defaults.
- Stops entirely — no ticks, no leaked timer — whenever: `live` is toggled
  off, `usePageVisible()` is false (tab hidden — `refetchIntervalInBackground`'s
  library-level default plus this page's own explicit visibility gate,
  deliberately not redundant: the gate also drives the visible "Paused -
  tab not visible" text and the manual toggle), no Device is selected, or
  the route unmounts (`AbortController.abort()` in the effect's cleanup).
  Resuming/returning fires exactly one immediate tick, not a burst of every
  pending Sensor at once.
- Each `SensorLiveCard` is a **passive** `useTelemetryTrailingPeriods`
  subscription only (`enabled: false`, no `refetchInterval`, no retry of
  its own) — it never fetches on its own; it just reads whatever the
  orchestrator last wrote into the shared TanStack Query cache under the
  exact same key. This is what lets 25 cards render live-updating values
  from one shared rotation without each one deciding independently when to
  fetch.
- Distinguishes no-data (`EmptyState`), stale-data (`FreshnessPill`'s
  `stale` bucket, computed from `heartBeat`/`measured` age — never from
  "the frontend is currently connected," which proves nothing about the
  Device itself), rate-limited (`RateLimitBanner`), and request-failure
  (`ErrorState` with retry) as visually distinct states.
- Shows an explanatory empty state, not a fake reading, for Periodic
  (curve) Sensors — trailing-periods has no meaning for a curve run; curve
  Sensors are excluded from the rotation entirely rather than wasting a
  turn on them every sweep.

**Documented future enhancements, not blockers** (see
`TASK_IMPLEMENTATION.md`'s missing-capability log): a batched
multiple-Sensor latest-value endpoint (would let every Sensor refresh
every 3s instead of one at a time — the single biggest remaining
improvement, blocked only on a backend capability that doesn't exist
today), a push/SSE/WebSocket stream, server-side telemetry downsampling,
and cross-tab schedule coordination (each browser tab currently runs its
own independent orchestrator instance against a rate limit shared across
all of them — see the multi-tab note above). None of the four exists
today; none was invented.

## Live Monitoring: shown Sensors only, filter, paging, manual refresh

Supersedes the parts of "Live Monitoring" above that describe the rotation as covering **every** Sensor of the Device and a global "Refresh now" button (the cadence itself is still defined only in `POLL_INTERVALS_MS.liveMonitoringCycle`; read the current value there, the numbers quoted above may be older).

Why: a Device such as the Vibration_Duo has 326 Sensors. One request per tick through all of them took minutes per sweep, so nearly every card sat on "Waiting for first refresh…", and the old "Refresh now" only restarted the rotation at its first Sensor - it neither refreshed the Sensor the user cared about nor said what it did.

- **What is shown is what is kept fresh.** `LiveMonitoringPage.tsx` filters the Device's Sensors (case-insensitive text match on name or externalSensorId, debounced 500 ms so typing does not restart the rotation per keystroke), pages them (10 / 25 / 50 per page, default 10) and passes only the shown non-curve Sensors to `useLiveMonitoringSchedule`. Each shown Sensor is therefore refreshed about every `shown x cadence` seconds; the status line says exactly that. Changing the filter, page size, page or Device restarts the rotation on the new set (the page resets to the first one on a filter/size/Device change). The request budget argument is unchanged: still exactly one request in flight, one per tick.
- **Per-Sensor refresh icon** on every non-curve card (`aria-label="Refresh {name}"`, spinner while it runs): one request for that Sensor now, also while the rotation is paused.
- **"Refresh shown"** replaces "Refresh now": refreshes every Sensor on screen now, **one after another** (never in parallel), with "Refreshing 5 / 12…" progress. Both go through `refreshSensors(ids)` in the hook.
- **Invariants kept**: never two Live Monitoring requests in flight (a manual run does nothing while a rotation tick or another manual run is in flight, and the rotation holds back 250 ms at a time while a manual run is in flight); a 429 from a manual request starts the **same shared cooldown** (`cooldownRef`/`cooldownUntil`) that holds back the rotation and disables every refresh control, and ends a multi-Sensor run; any other error stays on that Sensor's card and the run continues; the cooldown also ends by itself when its time elapses (needed when the rotation is paused); a manual run is aborted when the Device changes or the page unmounts.
- Tests: `useLiveMonitoringSchedule.test.tsx` (single and multi-Sensor refresh, no overlap, rotation held back, 429 cooldown shared with the rotation, cooldown ends while paused); checked in a real Chromium with a mocked API (10 cards of 60, rotation limited to the shown Sensors, one request for one icon click, 12 sequential requests for "Refresh shown", filter narrows and the rotation follows, paging, 429 banner with controls disabled and recovery).

## Live Monitoring charts: time-only axis, click to enlarge

On the Live Monitoring cards the chart's x axis shows only the clock time (**HH:mm:ss**, `formatTime` in `src/lib/dateTime.ts`; `TelemetryChart`'s new `timeAxis='time'` option - other pages keep the month-day + time ticks); the tooltip of a point still carries the full date and time. **Clicking a card's chart opens it large in a modal window** (`Dialog`, 85% of the window width with a chart about 85vh - 230 px tall, so roughly 15% stays free around it; control limits, the latest value and its full timestamp; the same per-Sensor **refresh** button as the card sits top right next to the X, and Close / Escape also leave it). The modal reads the same data as the card, so it moves with every refresh of that Sensor. The keyboard and screen-reader route is the **Enlarge** button in the card header (`aria-label="Enlarge chart of {Sensor}"`); the clickable chart area is a mouse convenience only. Checked in a real Chromium (mocked API): time-only ticks, click opens the modal, Escape and Close leave it, the button opens it.

Live Monitoring chart details (follow-up): the **small card charts** are `TelemetryChart compact` - no tooltip on hover, a legend that cannot be clicked to hide a line, and no text under the chart (the text summary stays in the page for screen readers, visually hidden; the card's "Dashboard checked ..." line is gone too). The **enlarged chart's hover tooltip** lists only **Actual** and **Target** with their values (and the unit) - not the Sensor's name and not the UCL3/LCL3 lines, which stay drawn and in the legend (`TelemetryChart`'s `plainTooltip`, used only by this modal; every other chart keeps naming each line).
**The enlarged chart draws the full reference set of the platform's original (`main`) chart** (`TelemetryChart`'s `detailedLimits`, used only by this modal): **Target** and **Tolerance** (the target compensated by the tolerance, named just "Tolerance": target + tolerance when lower is better, target - tolerance when higher is better, taken from the Sensor's `direction`; a Sensor with no known direction gets no tolerance line instead of a guessed one; a bidirectional Sensor gets Target Above/Below and Tolerance Above/Below), the **Actual** line, and the platform's **UCL3, UCL2, LCL2 and LCL3** with the two bands between UCL3-UCL2 and LCL2-LCL3 lightly shaded. The legend names the lines plainly ("Actual", "Target", "UCL3", ...) without the Sensor's name and in the original legend's order (Target, Tolerance, Actual, UCL3, UCL2, LCL2, LCL3). Target and Tolerance appear only where the API has a setpoint; the four limit lines UCL3/UCL2/LCL2/LCL3 are **always listed in the legend**, also when the platform has stored no value for them yet (nothing is drawn for such a line - the legend then still names it, as in the original chart), and a band is only shaded between two limits that are both there. Every value is the API's; the only arithmetic is target +/- tolerance. The small card charts are unchanged (target and Actual only).
**None of these lines is ever computed here**: every line is drawn as soon as the API returns a value for it, and a line the API has no value for draws nothing (its legend entry stays for the four limits) - there is **no explanatory notice** for that (the user did not want one). The Target / Tolerance come from the Sensor's setpoint; the control limits (the average plus/minus 2 and 3 standard deviations of the readings; nothing to do with target or tolerance) are calculated by the API for **every** reading while the Sensor's calculation is switched on - setpoint, 6th reading and `AnalysisResumedAt` play no part - and, when calculation is switched on, for every stored reading that has none (API `ControlLimitService`, decision 2026-11-01, newest readings first; see the API's CLAUDE.md "Analysis loop fixed"). So a Sensor that shows no limits has calculation off, or the API has not stored them yet; switching "Calculate" off and on on the Device page makes the API fill them in. (Before 2026-11-01 the limits were a by-product of the anomaly analysis, needed a setpoint and the 6th reading, and in the real one-reading-per-window flow were practically never stored at all.) The **enlarged chart** uses `timeAxis='fullDateTime'` (x ticks `yy-MM-dd HH:mm:ss`, `formatShortDateTime`) and `emphasizeHover`: hovering anywhere along the chart enlarges the marker of the point the tooltip shows to five times its size (radius 3 -> 15; interaction mode index, so the cursor need not sit on the point; the target and control-limit lines get no hover dot of their own).

## Dashboard additions of 2026-11-19 (overnight batch)

> One bullet of this CLAUDE.md section; the others are in `aggregation.md`, `calculation-switch.md`, `smart-analytics.md` and `sensor-import.md`.

- **Arrow keys in a large window**: Up / Down = previous / next Sensor of the page (Live Monitoring: the Sensors shown on the page that have a chart; Smart Analytics: the Sensor list, one Sensor on the chart). `useArrowStep` listens on the document (a handler on the window's own element lost the keys after a step, when the focus fell back to the page) and ignores keys while a select / input uses them.

## Fixes of the same day, after the first use (2026-11-19)

> One bullet of this CLAUDE.md section; the others are in `aggregation.md` and `smart-analytics.md`.

- **Up / Down in a large window** stepped through the aggregation select (it takes the focus first). The arrow keys now always step Sensors (`useArrowStep`: only a text field keeps its arrows); the select is changed with the mouse.

## Live Monitoring: position of the "Calculation off" label (2026-11-19)

> This line stood at the end of the CLAUDE.md section "Sheet headers are UpperCamelCase (2026-11-19, the user's rule)", which stays in CLAUDE.md.

Live Monitoring: the "Calculation off" label of a Sensor sits in the bottom right corner of its small chart (not in the card header).

## Anomaly markers (2026-11-19)

The Live Monitoring charts (cards and the enlarged chart) mark an anomalous reading with a marker at least twice as large as a normal value's - warning yellow, critical red; not in the legend. See `smart-analytics.md` ("Anomaly markers on the charts").
