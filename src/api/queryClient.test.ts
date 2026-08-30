import { describe, it, expect, vi, afterEach } from 'vitest';
import { shouldRetry, retryDelay, notifyGlobalFailure } from './queryClient';
import { ApiError } from './client';
import type { NormalizedApiError } from './errors';
import * as toastBridge from '@/components/toastBridge';

function apiError(status: number, extra: Partial<NormalizedApiError> = {}): ApiError {
  return new ApiError({ status, message: 'x', raw: undefined, ...extra });
}

describe('shouldRetry', () => {
  it('never retries auth/authorization/validation/conflict outcomes', () => {
    for (const status of [400, 401, 403, 404, 409]) {
      expect(shouldRetry(0, apiError(status))).toBe(false);
    }
  });

  it('retries a 429 exactly once', () => {
    expect(shouldRetry(0, apiError(429))).toBe(true);
    expect(shouldRetry(1, apiError(429))).toBe(false);
  });

  it('retries transient/5xx failures a couple of times', () => {
    expect(shouldRetry(0, apiError(500))).toBe(true);
    expect(shouldRetry(1, apiError(500))).toBe(true);
    expect(shouldRetry(2, apiError(500))).toBe(false);
  });

  it('retries non-ApiError failures (e.g. a thrown bug) a couple of times too', () => {
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
    expect(shouldRetry(2, new Error('boom'))).toBe(false);
  });
});

describe('retryDelay', () => {
  it('honors the server-declared Retry-After window for a 429, in milliseconds', () => {
    expect(retryDelay(0, apiError(429, { retryAfterSeconds: 30 }))).toBe(30_000);
  });

  it('falls back to exponential backoff when a 429 has no Retry-After header', () => {
    expect(retryDelay(0, apiError(429))).toBe(1000);
    expect(retryDelay(1, apiError(429))).toBe(2000);
  });

  it('uses exponential backoff, capped, for non-429 failures', () => {
    expect(retryDelay(0, apiError(500))).toBe(1000);
    expect(retryDelay(3, apiError(500))).toBe(8000);
    expect(retryDelay(10, apiError(500))).toBe(8000);
  });
});

describe('notifyGlobalFailure', () => {
  const noopToast: toastBridge.ToastLike = { success: vi.fn(), error: vi.fn(), info: vi.fn() };

  afterEach(() => {
    toastBridge.registerToastApi(noopToast);
  });

  it('toasts a network failure (status 0)', () => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    toastBridge.registerToastApi(toast);
    notifyGlobalFailure(apiError(0));
    expect(toast.error).toHaveBeenCalledWith(expect.any(String), 'Connection lost');
  });

  it('toasts a 429 with the Retry-After wait time when present', () => {
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    toastBridge.registerToastApi(toast);
    notifyGlobalFailure(apiError(429, { retryAfterSeconds: 12 }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('12s'), 'Too many requests');
  });

  it.each([400, 401, 403, 404, 409])(
    'does NOT toast a %d - that is handled inline at the call site (401 by redirect, others by ErrorState) to avoid duplicating feedback',
    (status) => {
      const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
      toastBridge.registerToastApi(toast);
      notifyGlobalFailure(apiError(status));
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.info).not.toHaveBeenCalled();
    },
  );
});
