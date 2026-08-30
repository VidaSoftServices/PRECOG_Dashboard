import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { ApiError } from './client';
import { getToastApi } from '@/components/toastBridge';

/**
 * Retry policy tuned to this specific API's documented rate limits (5-50
 * requests/min on several endpoints - real users can hit these during normal
 * use, not just abuse) and its lack of a genuine ProblemDetails envelope.
 */
/** Exported for unit testing - see queryClient.test.ts. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!(error instanceof ApiError)) return failureCount < 2;

  // Never retry auth/authorization/validation/conflict outcomes - retrying
  // won't change them, and for 401 the session is already being torn down.
  if ([400, 401, 403, 404, 409].includes(error.status)) return false;

  // 429: retry exactly once, after the server-declared Retry-After window.
  // React Query's `retryDelay` (below) reads the same error for the wait time.
  if (error.status === 429) return failureCount < 1;

  // Transient/5xx: a couple of quick retries.
  return failureCount < 2;
}

/** Exported for unit testing - see queryClient.test.ts. */
export function retryDelay(failureCount: number, error: unknown): number {
  if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds) {
    return error.retryAfterSeconds * 1000;
  }
  return Math.min(1000 * 2 ** failureCount, 8000);
}

/**
 * Global, cross-cutting failure feedback via toast - deliberately narrow.
 * Per-field/per-form validation failures (400/409, etc.) stay next to the
 * control that caused them (ErrorState at the call site) and are NOT
 * toasted here too, to avoid showing the same failure twice. Only two
 * failure modes are inherently *not* about one specific field or form, so
 * they're the only ones surfaced globally:
 *   - a network failure (status 0) - the user's connection or the API
 *     itself is unreachable, not something any one form did wrong.
 *   - a 429 - a policy-level rate limit, with a concrete wait time from the
 *     server, useful to see even if the underlying page doesn't have room
 *     for a persistent banner.
 * 401 is deliberately not toasted here - the redirect to /login (triggered
 * by authStore.notifyUnauthorized in client.ts) is feedback enough on its
 * own and a toast would just be noise on top of a full navigation.
 */
/** Exported for unit testing - see queryClient.test.ts. */
export function notifyGlobalFailure(error: unknown): void {
  if (!(error instanceof ApiError)) return;
  const toast = getToastApi();
  if (!toast) return;

  if (error.status === 0) {
    toast.error('Check your connection and try again.', 'Connection lost');
  } else if (error.status === 429) {
    const wait = error.retryAfterSeconds ? `Try again in ${error.retryAfterSeconds}s.` : 'Try again shortly.';
    toast.error(wait, 'Too many requests');
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: notifyGlobalFailure,
  }),
  mutationCache: new MutationCache({
    onError: notifyGlobalFailure,
  }),
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      retryDelay,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: {
      retry: false,
    },
  },
});
