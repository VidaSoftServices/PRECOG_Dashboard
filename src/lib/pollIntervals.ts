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
  /**
   * Device detail page, so its "Last heartbeat" stays truthful while the page
   * is open. A Device reports liveness every 30 s, so matching that cadence is
   * enough - anything faster only adds requests without adding information.
   *
   * Needed because the global query defaults are `staleTime: 15_000` with
   * `refetchOnWindowFocus: false`: without an interval the page would hold its
   * first response for as long as it stays mounted, and a healthy, actively
   * reporting Device would appear to age ("12 minutes ago") indefinitely -
   * which reads as a dead Device, and is worse than the "never" it replaced.
   *
   * `GET /api/Devices/{deviceId}` carries no named rate-limit policy (only the
   * global per-address limiter), so this does not consume the
   * `LargeTelemetryRead` budget that Live Monitoring depends on.
   */
  deviceDetail: 30_000,
} as const;
