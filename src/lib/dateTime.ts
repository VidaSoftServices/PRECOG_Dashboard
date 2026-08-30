import { formatISO, formatDistanceToNow, format, isValid, parseISO } from 'date-fns';

/**
 * Every API boundary uses ISO 8601 UTC, never a hand-rolled offset (see the
 * modernization audit's finding on the old dashboard's manual
 * getTimezoneOffset() arithmetic). Display always shows the viewer's local
 * time AND is labeled with the local zone, so nothing is silently converted
 * without the user knowing which zone they're looking at - decision #7.
 */

export function toApiIso(date: Date): string {
  return formatISO(date);
}

export function parseApiDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

const localZoneLabel = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
  .formatToParts(new Date())
  .find((part) => part.type === 'timeZoneName')?.value;

export function localZone(): string {
  return localZoneLabel ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = typeof value === 'string' ? parseApiDate(value) : value;
  if (!date || !isValid(date)) return '—';
  return format(date, 'yyyy-MM-dd HH:mm:ss');
}

export function formatDateTimeWithZone(value: string | Date | null | undefined): string {
  const formatted = formatDateTime(value);
  return formatted === '—' ? formatted : `${formatted} ${localZone()}`;
}

export function formatRelative(value: string | Date | null | undefined): string {
  const date = typeof value === 'string' ? parseApiDate(value) : value;
  if (!date || !isValid(date)) return 'never';
  return formatDistanceToNow(date, { addSuffix: true });
}

/** Freshness bucket for telemetry/heartbeat timestamps - used for status pills, never color alone (decision #12/#19 accessibility rule). */
export type Freshness = 'fresh' | 'aging' | 'stale' | 'unknown';

export function freshnessOf(value: string | Date | null | undefined, freshMinutes = 15, agingMinutes = 60): Freshness {
  const date = typeof value === 'string' ? parseApiDate(value) : value;
  if (!date || !isValid(date)) return 'unknown';
  const minutesAgo = (Date.now() - date.getTime()) / 60_000;
  if (minutesAgo <= freshMinutes) return 'fresh';
  if (minutesAgo <= agingMinutes) return 'aging';
  return 'stale';
}
