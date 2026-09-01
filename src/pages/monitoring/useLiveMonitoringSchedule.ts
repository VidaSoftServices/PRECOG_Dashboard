import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { fetchAndCacheTelemetryTrailingPeriods, type TelemetryFamily } from '@/api/hooks/telemetry';

export interface RotationSensor {
  id: number;
  family: TelemetryFamily;
}

interface UseLiveMonitoringScheduleArgs {
  /** live && pageVisible && a Device is selected && ...every other gate this page already has. */
  active: boolean;
  deviceId: number | undefined;
  /** Only Sensors whose family actually has trailing-periods data - curve Sensors are never fetched (CLAUDE.md "Telemetry"). */
  sensors: RotationSensor[];
  periods: number;
  intervalMs: number;
}

export interface LiveMonitoringScheduleState {
  /** The Sensor whose fetch is in flight right now, or null between ticks. */
  activeSensorId: number | null;
  /** When the most recent tick (of any Sensor) last completed successfully - the page-level "last refresh" indicator. */
  lastTickAt: Date | null;
  /** Non-null while backed off after a 429; the schedule is paused until this instant. */
  cooldownUntil: Date | null;
  /** Manually advances the rotation by one Sensor right now, without waiting out the rest of the current interval. */
  refreshNow: () => void;
}

/**
 * Bounded-concurrency rate: math, not a guess (CLAUDE.md's "Live Monitoring"
 * has the full derivation). `LargeTelemetryRead` allows 30 requests/60s per
 * client IP - shared across every dashboard page and every browser tab on
 * that network, not just this one. Dispatching more than one Sensor
 * concurrently, even the commonly-suggested "2-4", already exceeds the
 * entire budget on its own (2 x 20 cycles/min = 40/min > 30/min) before
 * accounting for any other page or tab. Exactly one Sensor fetched per tick
 * (never more, by construction - the loop below always awaits the previous
 * fetch before scheduling the next) yields 20 requests/min sustained: 67%
 * of the hard limit, a genuine 33% margin for everything else sharing that
 * IP. This is a *stronger* guarantee than "bounded concurrency 2-4" would
 * have been, not a weaker one - peak concurrent Live-Monitoring-originated
 * requests is 1, not up to 4.
 */
const FALLBACK_BACKOFF_BASE_MS = 5_000;
const FALLBACK_BACKOFF_MAX_MS = 60_000;

/** Exported for unit testing - see useLiveMonitoringSchedule.test.ts. */
export function computeFallbackBackoffMs(consecutiveRateLimits: number): number {
  return Math.min(FALLBACK_BACKOFF_BASE_MS * 2 ** Math.max(0, consecutiveRateLimits - 1), FALLBACK_BACKOFF_MAX_MS);
}

/** Exported for unit testing - see useLiveMonitoringSchedule.test.ts. */
export function nextRotationIndex(index: number, sensorCount: number): number {
  if (sensorCount <= 0) return 0;
  return (index + 1) % sensorCount;
}

/**
 * Owns Live Monitoring's *single* logical refresh cycle - never more than
 * one Sensor fetch in flight, never more than one pending schedule, never a
 * per-Sensor `setInterval`. See CLAUDE.md's "Live Monitoring" section for
 * why this shape exists (the confirmed `LargeTelemetryRead` rate limit)
 * before changing any of the timing here.
 */
export function useLiveMonitoringSchedule({
  active,
  deviceId,
  sensors,
  periods,
  intervalMs,
}: UseLiveMonitoringScheduleArgs): LiveMonitoringScheduleState {
  const queryClient = useQueryClient();
  const [activeSensorId, setActiveSensorId] = useState<number | null>(null);
  const [lastTickAt, setLastTickAt] = useState<Date | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null);
  const [manualNonce, setManualNonce] = useState(0);

  // Sensor identity as a primitive dependency - an array literal is a new
  // reference every render even with the same ids, which would restart the
  // rotation (and the effect below) on every unrelated re-render otherwise.
  const sensorsKey = sensors.map((s) => `${s.id}:${s.family}`).join(',');

  const refreshNow = useCallback(() => setManualNonce((n) => n + 1), []);

  useEffect(() => {
    if (!active || deviceId === undefined || sensors.length === 0) return;

    let cancelled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let rotationIndex = 0;
    let consecutiveRateLimits = 0;
    const abortController = new AbortController();

    async function runTick() {
      if (cancelled) return;
      const cycleStart = Date.now();
      const sensor = sensors[rotationIndex % sensors.length]!;
      rotationIndex = nextRotationIndex(rotationIndex, sensors.length);
      setActiveSensorId(sensor.id);

      let rateLimited = false;
      let cooldownMs = 0;
      try {
        await fetchAndCacheTelemetryTrailingPeriods(
          queryClient,
          { family: sensor.family, deviceId, sensorId: sensor.id, periods },
          abortController.signal,
        );
        if (!cancelled) {
          consecutiveRateLimits = 0;
          setLastTickAt(new Date());
          setCooldownUntil(null);
        }
      } catch (err) {
        // Aborted by cleanup (route change/Device switch) - not a real
        // failure, and cancelled is already true, so just stop quietly.
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 429) {
          rateLimited = true;
          consecutiveRateLimits += 1;
          cooldownMs = err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : computeFallbackBackoffMs(consecutiveRateLimits);
          setCooldownUntil(new Date(Date.now() + cooldownMs));
        }
        // Any other error (network blip, one Sensor's own 404/500): leave it
        // on that Sensor's own query state via fetchQuery's normal caching -
        // partial failure must not stop the rotation for every other Sensor.
      }

      if (cancelled) return;
      setActiveSensorId(null);

      const elapsed = Date.now() - cycleStart;
      const delay = rateLimited ? cooldownMs : Math.max(0, intervalMs - elapsed);
      timeoutHandle = setTimeout(runTick, delay);
    }

    void runTick();

    return () => {
      cancelled = true;
      abortController.abort();
      if (timeoutHandle) clearTimeout(timeoutHandle);
      setActiveSensorId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sensorsKey is the intentional stable proxy for `sensors` (see comment above); including the array itself would restart this effect every render.
  }, [active, deviceId, sensorsKey, periods, intervalMs, queryClient, manualNonce]);

  return { activeSensorId, lastTickAt, cooldownUntil, refreshNow };
}
