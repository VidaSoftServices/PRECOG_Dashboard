/**
 * Central, single source of truth for every polling cadence in the app -
 * approved defaults (decision #9). Change here, not at call sites.
 */
export const POLL_INTERVALS_MS = {
  /** Live Monitoring's latest-reading value per Sensor. */
  liveSensorValue: 10_000,
  /** Live Monitoring's compact recent-trend chart. */
  liveCompactChart: 15_000,
  /** Overview page's operational summary tiles. */
  overviewSummary: 30_000,
  /** TrainingRequest or Ollama job while in an active (non-terminal) state. */
  activeJob: 5_000,
} as const;
