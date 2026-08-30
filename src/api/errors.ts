/**
 * Error-body normalizer.
 *
 * VidaSoft.API's own integration guide claims a uniform ProblemDetails error
 * envelope. It does not exist - there is no ProblemDetails/IExceptionHandler
 * middleware in the running API (confirmed against Program.cs). Real error
 * bodies are one of three shapes:
 *   1. A plain string, from `BadRequest("...")` / `NotFound("...")` / `Conflict("...")`.
 *   2. An ad-hoc object, usually `{ Message: "..." }` or `{ message: "..." }`
 *      (casing is inconsistent across controllers) from `Unauthorized(new {...})`.
 *   3. A genuine `ValidationProblemDetails` - but only from ASP.NET Core's
 *      automatic model-binding/validation failures, never hand-written.
 *
 * Never assume shape 3 for a hand-written 4xx/5xx. This normalizer inspects the
 * body defensively and always produces one consistent shape for the UI layer.
 */

export interface NormalizedApiError {
  status: number;
  message: string;
  /** Present only when the body was a genuine ValidationProblemDetails. */
  fieldErrors?: Record<string, string[]>;
  /** Present only on 429 responses that carried a Retry-After header. */
  retryAfterSeconds?: number;
  /**
   * Opportunistic - only set if the response carried a request/trace id
   * header. Safe to show a user ("quote this to support"): it's an opaque
   * identifier, never a stack trace or internal path. No known operation in
   * this API currently emits one; this exists so the client doesn't need
   * changes if/when one is added.
   */
  correlationId?: string;
  raw: unknown;
}

interface ValidationProblemDetailsShape {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

function looksLikeValidationProblemDetails(body: unknown): body is ValidationProblemDetailsShape {
  return (
    typeof body === 'object' &&
    body !== null &&
    ('errors' in body || 'title' in body) &&
    !('Message' in body) &&
    !('message' in body)
  );
}

function extractAdHocMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const value = record.Message ?? record.message ?? record.detail ?? record.title;
  return typeof value === 'string' ? value : undefined;
}

export async function normalizeApiError(response: Response, parsedBody?: unknown): Promise<NormalizedApiError> {
  let body = parsedBody;
  if (body === undefined) {
    const text = await response.text().catch(() => '');
    try {
      body = text ? JSON.parse(text) : text;
    } catch {
      body = text;
    }
  }

  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  const correlationId =
    response.headers.get('X-Correlation-Id') ?? response.headers.get('X-Request-Id') ?? undefined;

  if (typeof body === 'string' && body.length > 0) {
    return { status: response.status, message: body, retryAfterSeconds, correlationId, raw: body };
  }

  if (looksLikeValidationProblemDetails(body)) {
    const firstFieldMessage = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
    return {
      status: response.status,
      message: body.detail ?? body.title ?? firstFieldMessage ?? `Request failed (${response.status})`,
      fieldErrors: body.errors,
      retryAfterSeconds,
      correlationId,
      raw: body,
    };
  }

  const adHocMessage = extractAdHocMessage(body);
  if (adHocMessage) {
    return { status: response.status, message: adHocMessage, retryAfterSeconds, correlationId, raw: body };
  }

  return {
    status: response.status,
    message: defaultMessageForStatus(response.status),
    retryAfterSeconds,
    correlationId,
    raw: body,
  };
}

function defaultMessageForStatus(status: number): string {
  switch (status) {
    case 401:
      return 'Your session has expired. Please sign in again.';
    case 403:
      return "You don't have permission to do that.";
    case 404:
      return 'Not found.';
    case 409:
      return 'That conflicts with the current state - refresh and try again.';
    case 429:
      return 'Too many requests - please wait a moment and try again.';
    default:
      return `Request failed (${status})`;
  }
}
