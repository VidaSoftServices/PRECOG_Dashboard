/**
 * Central, single source of truth for every polling cadence in the app -
 * approved defaults (decision #9). Change here, not at call sites.
 */
export const POLL_INTERVALS_MS = {
  /**
   * Live Monitoring's page-level refresh cycle tick. This is the interval
   * between rotation advances, NOT a per-Sensor refresh guarantee - see
   * `useLiveMonitoringSchedule.ts`'s own doc comment for why a literal
   * "every Sensor refreshes every 3s" is impossible under the API's
   * confirmed `LargeTelemetryRead` rate limit (30 requests/60s per client
   * IP, shared across every dashboard page and browser tab on that
   * network - CLAUDE.md's "Live Monitoring" section has the full
   * calculation). Named `liveMonitoringCycle`, not `liveSensorValue`/
   * `liveCompactChart` (both retired) - there is now exactly one polling
   * concept for this page, not a per-card interval.
   */
  liveMonitoringCycle: 1_000,
  /** Overview page's operational summary tiles. */
  overviewSummary: 30_000,
  /** TrainingRequest or Ollama job while in an active (non-terminal) state. */
  activeJob: 5_000,
} as const;
