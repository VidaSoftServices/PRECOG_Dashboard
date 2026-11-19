# Control limits (UCL / LCL)

The Dashboard consequence of the 2026-11-18 decision that the API calculates the control limits when it reads: range reads carry them by default, the batched trailing read does not, so the enlarged Live Monitoring chart reads its own Sensor; "Calculated up to" became "Analysed up to". How the limits are drawn is in `live-monitoring.md` and `smart-analytics.md`.

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/control-limits.md](../../../PRECOG_API/docs/features/control-limits.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## Control limits are calculated by the API, not stored (2026-11-18)

The four limit rows per reading (UCL3/UCL2/LCL2/LCL3) are no longer stored: the API calculates them when it reads (the average plus/minus 2 and 3 sample standard deviations of each reading's window - the reading and up to 9,999 before it, bounded by the Sensor's raw Lookback/Scale). The dashboard needs nothing different for the range reads (Smart Analytics, Issue detail: `includeControlLimits` defaults to true). The batched trailing read Live Monitoring's cards use does NOT carry them (50 Sensors x 9,999 readings every 5 s would be 500,000 rows); the enlarged chart therefore reads its own Sensor with the single `MeasuredTrailingPeriods` read (`useTelemetryTrailingWithLimits`, every `liveMonitoringCycle` while the window is open, paused in a cooldown), and draws the card's data until that answers. The Device page's "Calculated up to" line is now "Analysed up to" (the newest Analysed row; "Not analysed" without a setpoint). Where the older sections below say the limits are stored or that a missing limit means calculation is off, read them as superseded by this.
