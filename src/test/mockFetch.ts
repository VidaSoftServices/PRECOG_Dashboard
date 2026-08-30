import type { Mock } from 'vitest';

/**
 * The one stable mock installed by setup.ts - see the comment there for why
 * a fresh `vi.stubGlobal('fetch', ...)` per test doesn't work for anything
 * that goes through src/api/client.ts's apiClient.
 */
export function fetchMock(): Mock {
  return globalThis.fetch as unknown as Mock;
}

export function mockFetchOnce(response: Response): void {
  fetchMock().mockResolvedValueOnce(response);
}

export function mockFetchJson(status: number, body: unknown, headers: Record<string, string> = {}): void {
  mockFetchOnce(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }),
  );
}

/** Every subsequent call resolves the same way, for hooks that poll or refetch. */
export function mockFetchJsonAlways(status: number, body: unknown, headers: Record<string, string> = {}): void {
  fetchMock().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }),
  );
}

interface FetchRoute {
  /** Matched against the request URL with String.includes (a plain string) or RegExp.test. */
  match: string | RegExp;
  status?: number;
  body: unknown;
}

/**
 * For a component/page that calls several different endpoints in one
 * render (e.g. GetUserDetails + Devices + TrainingRequests), each needing
 * its own response body. Routes are checked in order; the first match wins.
 */
export function mockFetchRoutes(routes: FetchRoute[]): void {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const route = routes.find((r) => (typeof r.match === 'string' ? url.includes(r.match) : r.match.test(url)));
    if (!route) {
      throw new Error(`mockFetchRoutes: no route matched ${url}`);
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}
