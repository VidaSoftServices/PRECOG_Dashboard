import { ApiError } from '@/api/client';

/** Waits `ms`, but wakes immediately (rejecting) if `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

export const MAX_RATE_LIMIT_RETRIES = 4;

export type Failed = { ok: false; message: string; status: number; stop: boolean };
export type Attempt<T> = { ok: true; value: T } | Failed;

/**
 * Runs one request for a bulk operation (an import, a sync) that makes many of them in a row: waits the server's Retry-After
 * (default 5 s, at most 60 s) on 429 and retries it, at most 4 times, and never throws - the outcome is returned.
 * `stop`: the whole operation must end (401/403, or the user pressed Stop).
 */
export async function attempt<T>(call: () => Promise<T>, signal?: AbortSignal): Promise<Attempt<T>> {
  for (let tries = 0; ; tries += 1) {
    try {
      return { ok: true, value: await call() };
    } catch (error) {
      if (signal?.aborted) return { ok: false, message: 'The operation was stopped.', status: 0, stop: true };
      const status = error instanceof ApiError ? error.status : 0;
      if (status === 429 && tries < MAX_RATE_LIMIT_RETRIES) {
        try {
          await sleep(Math.min((error as ApiError).retryAfterSeconds ?? 5, 60) * 1000, signal);
        } catch {
          return { ok: false, message: 'The operation was stopped.', status: 0, stop: true };
        }
        continue;
      }
      return { ok: false, message: error instanceof Error ? error.message : 'Request failed.', status, stop: status === 401 || status === 403 };
    }
  }
}
