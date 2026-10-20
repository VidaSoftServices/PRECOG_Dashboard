/**
 * Display of a server-side 64-bit id (for example `DevicePrincipal.Id`, an int64).
 *
 * The generated API types carry such ids as `number`, and the HTTP client reads the response with `JSON.parse`, so an id
 * is exact only up to `Number.MAX_SAFE_INTEGER` (9007199254740991 = 2^53 - 1). Beyond that the digits have already been
 * rounded before any code here sees the value, so showing them would silently show a WRONG id. This helper therefore
 * never formats or "fixes" a value: a safe integer is shown as its plain digits (no locale formatting, no thousands
 * separators, no exponent), anything else is reported as not exact so the caller can say so instead of showing it.
 */
export interface IdText {
  /** The plain decimal digits, or '' when the id is missing or cannot be shown exactly. */
  text: string;
  /** False only for a number that is not a safe integer (the id cannot be trusted at this precision). */
  exact: boolean;
}

export const MAX_EXACT_ID = Number.MAX_SAFE_INTEGER;

export function formatInt64Id(value: number | null | undefined): IdText {
  if (value === null || value === undefined) return { text: '', exact: true };
  if (!Number.isSafeInteger(value)) return { text: '', exact: false };
  return { text: String(value), exact: true };
}
