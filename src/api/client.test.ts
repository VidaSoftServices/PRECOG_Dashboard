import { describe, it, expect, vi } from 'vitest';
import { unwrap, ApiError } from './client';

describe('unwrap', () => {
  it('returns data when present', () => {
    expect(unwrap({ data: { id: 1 } })).toEqual({ id: 1 });
  });

  it('does not throw for a 204 No Content response, even though data is undefined', () => {
    // openapi-fetch itself returns `data: undefined` for ANY 204/HEAD/empty-
    // content-length response regardless of what the server actually sent -
    // this is the exact case that used to be misreported as "Empty response
    // from API" (see client.ts's unwrap doc comment for the full story).
    // Many real mutations in this app return 204: Company_AssignRole,
    // Company_RevokeReaderDeviceGrant, AggregationPolicies_DeactivatePolicy,
    // Devices_SetPrincipalEnabled, and more.
    const result = { data: undefined, response: new Response(null, { status: 204 }) };
    expect(() => unwrap(result)).not.toThrow();
    expect(unwrap(result)).toBeUndefined();
  });

  it('still throws for a non-204 response with no data - a genuinely unexpected empty body', () => {
    const result = { data: undefined, response: new Response(null, { status: 200 }) };
    expect(() => unwrap(result)).toThrow(ApiError);
  });

  it('still throws when no response info is available at all', () => {
    expect(() => unwrap({ data: undefined })).toThrow(ApiError);
  });
});

describe('a request the caller cancelled is not a connection failure', () => {
  it('keeps an aborted request as an AbortError - never an ApiError with status 0 - so no "Connection lost" toast follows', async () => {
    const { apiClient, isAbort } = await import('./client');
    const { fetchMock } = await import('@/test/mockFetch');
    const { notifyGlobalFailure } = await import('./queryClient');
    const toastBridge = await import('@/components/toastBridge');
    const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    toastBridge.registerToastApi(toast);

    fetchMock().mockRejectedValueOnce(new DOMException('The user aborted a request.', 'AbortError'));
    const controller = new AbortController();
    controller.abort();
    const error = await apiClient.GET('/api/Devices', { signal: controller.signal }).then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeDefined();
    expect(error).not.toBeInstanceOf(ApiError);
    expect(isAbort(error)).toBe(true);
    notifyGlobalFailure(error);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still reports a genuine network failure as a status-0 ApiError', async () => {
    const { apiClient } = await import('./client');
    const { fetchMock } = await import('@/test/mockFetch');

    fetchMock().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const error = await apiClient.GET('/api/Devices').then(
      () => undefined,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
  });

  it('recognises an abort by the error name or by the request signal', async () => {
    const { isAbort } = await import('./client');
    expect(isAbort(new DOMException('x', 'AbortError'))).toBe(true);
    expect(isAbort(new TypeError('Failed to fetch'))).toBe(false);
    const controller = new AbortController();
    controller.abort();
    expect(isAbort(new Error('anything'), new Request('http://localhost/x', { signal: controller.signal }))).toBe(true);
  });
});
