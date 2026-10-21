import { useEffect, useState, useCallback, useRef } from 'react';
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
  /** The Sensor a manual refresh (see refreshSensors) has in flight right now, or null. */
  manualSensorId: number | null;
  /** Progress of a manual refresh of several Sensors ("Refreshing 5 / 12"), or null when none runs. */
  manualProgress: { done: number; total: number } | null;
  /**
   * Refreshes the given Sensors once, right now, one after another (also while the rotation is paused) - what the per-Sensor
   * refresh icon (one id) and "Refresh shown" (every Sensor on screen) do. It never overlaps another Live Monitoring request:
   * it does nothing while the rotation's tick or another manual refresh is in flight, or while a 429 cooldown runs (callers
   * disable their controls then). A 429 starts the same shared cooldown the rotation uses - it also holds the rotation back -
   * and ends the run; any other failure stays on that Sensor's own card and the run goes on with the next Sensor.
   */
  refreshSensors: (sensorIds: number[]) => void;
}

/**
 * Bounded-concurrency rate: math, not a guess (CLAUDE.md's "Live Monitoring"
 * has the full derivation). `LargeTelemetryRead` allows 240 requests/120s
 * (120/min on average) per client IP - shared across every dashboard page and
 * every browser tab on that network, not just this one. Dispatching several
 * Sensors concurrently, even the commonly-suggested "2-4", multiplies the
 * request rate (2 x 20 cycles/min = 40/min) and leaves that much less for
 * every other page and tab. Exactly one Sensor fetched per tick (never more,
 * by construction - the loop below always awaits the previous fetch before
 * scheduling the next) yields 20 requests/min sustained: about 17% of the
 * limit, a wide margin for everything else sharing that IP. This is a
 * *stronger* guarantee than "bounded concurrency 2-4" would have been, not a
 * weaker one - peak concurrent Live-Monitoring-originated requests is 1, not
 * up to 4. The API's limits were doubled; the cadence was deliberately not
 * raised with them.
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
  const [manual, setManual] = useState<{ sensorId: number; done: number; total: number } | null>(null);
  // Refs, because the rotation loop and refreshSensor must see each other's state without re-running the loop's effect.
  const busyRef = useRef(false); // a Live Monitoring request is in flight (rotation tick or manual refresh) - never two at once
  const cooldownRef = useRef(0); // epoch ms until which no request may start (0 = none)
  const manualAbortRef = useRef<AbortController | null>(null);

  const applyCooldown = useCallback((until: Date | null) => {
    cooldownRef.current = until ? until.getTime() : 0;
    setCooldownUntil(until);
  }, []);

  // Sensor identity as a primitive dependency - an array literal is a new
  // reference every render even with the same ids, which would restart the
  // rotation (and the effect below) on every unrelated re-render otherwise.
  const sensorsKey = sensors.map((s) => `${s.id}:${s.family}`).join(',');

  const refreshSensors = useCallback(
    (sensorIds: number[]) => {
      if (deviceId === undefined || busyRef.current || cooldownRef.current > Date.now()) return;
      const targets = sensorIds.flatMap((id) => sensors.filter((s) => s.id === id));
      if (targets.length === 0) return;
      busyRef.current = true;
      const controller = new AbortController();
      manualAbortRef.current = controller;

      void (async () => {
        try {
          for (const [index, sensor] of targets.entries()) {
            if (controller.signal.aborted) return;
            setManual({ sensorId: sensor.id, done: index, total: targets.length });
            try {
              await fetchAndCacheTelemetryTrailingPeriods(queryClient, { family: sensor.family, deviceId, sensorId: sensor.id, periods }, controller.signal);
              if (!controller.signal.aborted) applyCooldown(null);
            } catch (err) {
              if (controller.signal.aborted) return;
              if (err instanceof ApiError && err.status === 429) {
                applyCooldown(new Date(Date.now() + (err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : computeFallbackBackoffMs(1))));
                return; // the API asked everyone to slow down: end the run
              }
              // Any other error stays on the Sensor's own query state (its card shows it), like a rotation tick's.
            }
          }
        } finally {
          if (manualAbortRef.current === controller) manualAbortRef.current = null;
          busyRef.current = false;
          if (!controller.signal.aborted) setManual(null);
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sensorsKey is the intentional stable proxy for `sensors`.
    [sensorsKey, deviceId, periods, queryClient, applyCooldown],
  );

  // A manual 429 can happen while the rotation is paused, so nothing else would end the cooldown: end it when it elapses.
  useEffect(() => {
    if (!cooldownUntil) return;
    const handle = setTimeout(() => {
      if (cooldownRef.current === cooldownUntil.getTime()) applyCooldown(null);
    }, Math.max(0, cooldownUntil.getTime() - Date.now()));
    return () => clearTimeout(handle);
  }, [cooldownUntil, applyCooldown]);

  // A manual refresh belongs to the Device on screen: abort it when the Device (or the page) changes.
  useEffect(
    () => () => {
      manualAbortRef.current?.abort();
      manualAbortRef.current = null;
      busyRef.current = false;
      setManual(null);
    },
    [deviceId],
  );

  useEffect(() => {
    if (!active || deviceId === undefined || sensors.length === 0) return;

    let cancelled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let rotationIndex = 0;
    let consecutiveRateLimits = 0;
    const abortController = new AbortController();

    async function runTick() {
      if (cancelled) return;
      // One Live Monitoring request at a time: a manual refresh in flight, or a cooldown another path started, holds this tick back.
      const holdMs = busyRef.current ? 250 : cooldownRef.current - Date.now();
      if (holdMs > 0) {
        timeoutHandle = setTimeout(runTick, holdMs);
        return;
      }
      const cycleStart = Date.now();
      const sensor = sensors[rotationIndex % sensors.length]!;
      rotationIndex = nextRotationIndex(rotationIndex, sensors.length);
      setActiveSensorId(sensor.id);
      busyRef.current = true;

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
          applyCooldown(null);
        }
      } catch (err) {
        // Aborted by cleanup (route change/Device switch) - not a real
        // failure, and cancelled is already true, so just stop quietly.
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 429) {
          rateLimited = true;
          consecutiveRateLimits += 1;
          cooldownMs = err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : computeFallbackBackoffMs(consecutiveRateLimits);
          applyCooldown(new Date(Date.now() + cooldownMs));
        }
        // Any other error (network blip, one Sensor's own 404/500): leave it
        // on that Sensor's own query state via fetchQuery's normal caching -
        // partial failure must not stop the rotation for every other Sensor.
      }

      busyRef.current = false;
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
      busyRef.current = false;
      setActiveSensorId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sensorsKey is the intentional stable proxy for `sensors` (see comment above); including the array itself would restart this effect every render.
  }, [active, deviceId, sensorsKey, periods, intervalMs, queryClient, applyCooldown]);

  return {
    activeSensorId,
    lastTickAt,
    cooldownUntil,
    manualSensorId: manual?.sensorId ?? null,
    manualProgress: manual ? { done: manual.done, total: manual.total } : null,
    refreshSensors,
  };
}
