// Typed schema below is generated, never hand-edited. Regenerate with:
//   npm run gen:api
// (reads http://localhost:5065/swagger/v1/swagger.json - point VITE_API_BASE_URL
// and this command at the same environment when regenerating against something
// other than local Docker).
import createClient, { type Middleware } from 'openapi-fetch';
import type { AuthPatchedPaths } from './authHeaderPatch';
import { getToken, notifyUnauthorized } from '@/auth/authStore';
import { normalizeApiError, type NormalizedApiError } from './errors';

const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!baseUrl) {
  // Fail loudly at startup rather than silently falling back to a hardcoded
  // production host, which is exactly the bug this rewrite is fixing.
  throw new Error(
    'VITE_API_BASE_URL is not set. Copy .env.example to .env.local and point it at the API you want to run against.',
  );
}

/**
 * One normalized error shape for every failure mode a call site can hit:
 * HTTP 4xx/5xx (status > 0, from onResponse below) and network-level failures
 * - offline, DNS, CORS, connection refused (status 0, from onError below,
 *   since fetch() throws before a Response ever exists for these).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors?: Record<string, string[]>;
  readonly retryAfterSeconds?: number;
  readonly correlationId?: string;
  readonly raw: unknown;

  constructor(normalized: NormalizedApiError) {
    super(normalized.message);
    this.name = 'ApiError';
    this.status = normalized.status;
    this.fieldErrors = normalized.fieldErrors;
    this.retryAfterSeconds = normalized.retryAfterSeconds;
    this.correlationId = normalized.correlationId;
    this.raw = normalized.raw;
  }
}

/**
 * Every one of the live operations requires this header - HMAC-SHA256 token,
 * human or DevicePrincipal, never a Bearer/cookie scheme. See the
 * modernization audit's cross-cutting section for why this isn't JWT.
 *
 * Status-specific handling:
 *   401 - session is torn down here so every call site gets the same
 *         behavior for free; RequireAuth (via authStore) does the redirect.
 *   403/404/409/429 - normalized into ApiError.status/.retryAfterSeconds and
 *         left for the call site / React Query's error boundary to render,
 *         since the right UI differs per page (403->NotAuthorizedState,
 *         404->NotAuthorizedState for Reader-restricted Devices per the
 *         API's own existence-hiding pattern, 409->actionable conflict
 *         message, 429->backoff countdown - see queryClient.ts's retry policy).
 */
const authMiddleware: Middleware = {
  onRequest({ request }) {
    const token = getToken();
    if (token) request.headers.set('HMAC_Key', token);
    return request;
  },
  async onResponse({ response }) {
    if (response.ok) return response;

    // Clone before consuming the body - openapi-fetch also needs to read it.
    const normalized = await normalizeApiError(response.clone());

    if (response.status === 401) {
      notifyUnauthorized();
    }

    throw new ApiError(normalized);
  },
  onError({ error }) {
    // fetch() itself threw - offline, DNS failure, connection refused, CORS.
    // No Response object exists yet, so this never went through onResponse.
    if (error instanceof ApiError) return error;
    const message = error instanceof Error ? error.message : 'Network error - check your connection.';
    return new ApiError({ status: 0, message, raw: error });
  },
};

export const apiClient = createClient<AuthPatchedPaths>({ baseUrl });
apiClient.use(authMiddleware);

/**
 * openapi-fetch resolves even on non-2xx by default; the middleware above
 * throws before that happens, so `data` here is always defined on the happy
 * path. This thin wrapper exists so call sites don't need the `{data,error}`
 * dance and get a real thrown ApiError for React Query's onError/error
 * boundaries to catch instead.
 */
export function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.data === undefined) {
    // Should be unreachable - the middleware throws first - but keeps the
    // return type honest if openapi-fetch's typing ever allows both undefined.
    throw new ApiError({ status: 0, message: 'Empty response from API', raw: result.error });
  }
  return result.data;
}
