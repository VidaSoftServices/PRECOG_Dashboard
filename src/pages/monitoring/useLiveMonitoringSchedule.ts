import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { fetchAndCacheTelemetryTrailingBatch, type TelemetryFamily } from '@/api/hooks/telemetry';

/** A Sensor on screen and the telemetry family it is read as. */
export interface LiveSensor {
  id: number;
  family: TelemetryFamily;
}

interface UseLiveMonitoringScheduleArgs {
  /** live && pageVisible && a Device is selected && ...every other gate this page already has. */
  active: boolean;
  deviceId: number | undefined;
  /** Only Sensors whose family actually has trailing-periods data - curve Sensors are never fetched (CLAUDE.md "Telemetry"). */
  sensors: LiveSensor[];
  periods: number;
  intervalMs: number;
}

export interface LiveMonitoringScheduleState {
  /** When the most recent refresh last completed successfully - the page-level "last refresh" indicator. */
  lastTickAt: Date | null;
  /** Non-null while backed off after a 429; the schedule is paused until this instant. */
  cooldownUntil: Date | null;
  /** The Sensors a manual refresh (see refreshSensors) has in flight right now - empty when none runs. */
  manualSensorIds: number[];
  /**
   * Refreshes the given Sensors once, right now, in ONE batched request (also while the schedule is paused) - what the per-Sensor refresh
   * icon (one id) and "Refresh shown" (every Sensor on screen) do. It never overlaps another Live Monitoring request: a refresh that is
   * already on its way finishes first, a second manual refresh is ignored while one runs, and nothing starts during a 429 cooldown
   * (callers disable their controls then). A 429 starts the same shared cooldown the schedule uses; any other failure stays on the
   * Sensors' own cards (their query state).
   */
  refreshSensors: (sensorIds: number[]) => void;
}

/**
 * Rate math, not a guess (CLAUDE.md's "Live Monitoring" has the derivation). \`LargeTelemetryRead\` allows 240 requests/120s (120/min on
 * average) per client IP - shared across every dashboard page and every browser tab on that network. The schedule makes exactly ONE
 * request per interval for ALL the Sensors on screen (the API reads them together), so at 5 s that is 12 requests/min whether 10 or 50
 * Sensors are shown: a tenth of the limit, with a wide margin for every other page and tab. Never two Live Monitoring requests in
 * flight, by construction.
 */
const FALLBACK_BACKOFF_BASE_MS = 5_000;
const FALLBACK_BACKOFF_MAX_MS = 60_000;

/** Exported for unit testing - see useLiveMonitoringSchedule.test.ts. */
export function computeFallbackBackoffMs(consecutiveRateLimits: number): number {
  return Math.min(FALLBACK_BACKOFF_BASE_MS * 2 ** Math.max(0, consecutiveRateLimits - 1), FALLBACK_BACKOFF_MAX_MS);
}

/** The result of one batched request: it went through, or the API asked everyone to slow down (and for how long), or it failed otherwise. */
type BatchOutcome = { kind: 'ok' } | { kind: 'rateLimited'; waitMs: number } | { kind: 'failed' };

/**
 * Owns Live Monitoring's *single* logical refresh cycle - one batched request for every Sensor on screen each interval, never more than
 * one request in flight, never more than one pending schedule, never a per-Sensor \`setInterval\`. See CLAUDE.md's "Live Monitoring"
 * section for why this shape exists before changing any of the timing here.
 */
export function useLiveMonitoringSchedule({
  active,
  deviceId,
  sensors,
  periods,
  intervalMs,
}: UseLiveMonitoringScheduleArgs): LiveMonitoringScheduleState {
  const queryClient = useQueryClient();
  const [lastTickAt, setLastTickAt] = useState<Date | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<Date | null>(null);
  const [manualSensorIds, setManualSensorIds] = useState<number[]>([]);
  // Refs, because the schedule loop and refreshSensors must see each other's state without re-running the loop's effect.
  const inflightRef = useRef<Promise<unknown> | null>(null); // the Live Monitoring request in flight (a scheduled one or a manual one)
  const manualRef = useRef(false); // a manual refresh is running (or waiting for the request in flight)
  const cooldownRef = useRef(0); // epoch ms until which no request may start (0 = none)
  const manualAbortRef = useRef<AbortController | null>(null);

  const applyCooldown = useCallback((until: Date | null) => {
    cooldownRef.current = until ? until.getTime() : 0;
    setCooldownUntil(until);
  }, []);

  // Sensor identity as a primitive dependency - an array literal is a new reference every render even with the same ids, which would
  // restart the schedule (and the effect below) on every unrelated re-render otherwise.
  const sensorsKey = sensors.map((s) => `${s.id}:${s.family}`).join(',');

  /** One batched request for \`targets\`; a 429 and any other failure are turned into an outcome, an abort is rethrown. */
  const requestBatch = useCallback(
    async (targets: LiveSensor[], signal: AbortSignal, consecutiveRateLimits: number): Promise<BatchOutcome> => {
      if (deviceId === undefined) return { kind: 'failed' };
      try {
        await fetchAndCacheTelemetryTrailingBatch(queryClient, { deviceId, sensors: targets, periods }, signal);
        return { kind: 'ok' };
      } catch (err) {
        if (signal.aborted) throw err; // aborted by cleanup (route change / Device switch): not a failure
        if (err instanceof ApiError && err.status === 429) {
          return { kind: 'rateLimited', waitMs: err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : computeFallbackBackoffMs(consecutiveRateLimits) };
        }
        // Any other error (network blip, a 500): it stays on the Sensors' own query state - the next cycle simply tries again.
        return { kind: 'failed' };
      }
    },
    [deviceId, periods, queryClient],
  );

  const refreshSensors = useCallback(
    (sensorIds: number[]) => {
      if (deviceId === undefined || manualRef.current || cooldownRef.current > Date.now()) return;
      const targets = sensors.filter((s) => sensorIds.includes(s.id));
      if (targets.length === 0) return;
      manualRef.current = true;
      const controller = new AbortController();
      manualAbortRef.current = controller;
      setManualSensorIds(targets.map((t) => t.id));

      void (async () => {
        try {
          // A request that is already on its way finishes first: never two at once.
          await inflightRef.current?.catch(() => undefined);
          if (controller.signal.aborted) return;
          const pending = requestBatch(targets, controller.signal, 1);
          inflightRef.current = pending;
          const outcome = await pending;
          if (controller.signal.aborted) return;
          if (outcome.kind === 'rateLimited') applyCooldown(new Date(Date.now() + outcome.waitMs)); // ends the run; the schedule waits it out too
          else if (outcome.kind === 'ok') applyCooldown(null);
        } catch {
          // aborted: nothing to report
        } finally {
          if (manualAbortRef.current === controller) manualAbortRef.current = null;
          manualRef.current = false;
          if (!controller.signal.aborted) setManualSensorIds([]);
        }
      })();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sensorsKey is the intentional stable proxy for \`sensors\`.
    [sensorsKey, deviceId, requestBatch, applyCooldown],
  );

  // A manual 429 can happen while the schedule is paused, so nothing else would end the cooldown: end it when it elapses.
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
      manualRef.current = false;
      setManualSensorIds([]);
    },
    [deviceId],
  );

  useEffect(() => {
    if (!active || deviceId === undefined || sensors.length === 0) return;

    let cancelled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let consecutiveRateLimits = 0;
    const abortController = new AbortController();

    async function runTick() {
      if (cancelled) return;
      // One Live Monitoring request at a time: a manual refresh in flight, or a cooldown another path started, holds this tick back.
      const holdMs = manualRef.current ? 250 : cooldownRef.current - Date.now();
      if (holdMs > 0) {
        timeoutHandle = setTimeout(runTick, holdMs);
        return;
      }
      const cycleStart = Date.now();
      const pending = requestBatch(sensors, abortController.signal, consecutiveRateLimits + 1);
      inflightRef.current = pending;

      let outcome: BatchOutcome;
      try {
        outcome = await pending;
      } catch {
        return; // aborted by cleanup - cancelled is already true, stop quietly
      }
      if (cancelled) return;

      let delay: number;
      if (outcome.kind === 'rateLimited') {
        consecutiveRateLimits += 1;
        applyCooldown(new Date(Date.now() + outcome.waitMs));
        delay = outcome.waitMs;
      } else {
        if (outcome.kind === 'ok') {
          consecutiveRateLimits = 0;
          setLastTickAt(new Date());
          applyCooldown(null);
        }
        delay = Math.max(0, intervalMs - (Date.now() - cycleStart));
      }
      timeoutHandle = setTimeout(runTick, delay);
    }

    void runTick();

    return () => {
      cancelled = true;
      abortController.abort();
      if (timeoutHandle) clearTimeout(timeoutHandle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sensorsKey is the intentional stable proxy for \`sensors\` (see comment above); including the array itself would restart this effect every render.
  }, [active, deviceId, sensorsKey, periods, intervalMs, requestBatch, applyCooldown]);

  return { lastTickAt, cooldownUntil, manualSensorIds, refreshSensors };
}
