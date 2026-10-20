/**
 * Filters of the Logs page and their translation into API query parameters. Pure and unit-tested: nothing here reads the
 * log itself, it only turns what the user typed into the request the API expects (empty fields are left out, local
 * date-times become UTC instants, ids must be whole numbers).
 */

/** Entries per page - the API's default too, so "30 entries by default" holds on both sides. */
export const LOG_PAGE_SIZE = 30;

/** The API refuses to page past this many skipped entries (the user is then asked to narrow the filters). */
export const LOG_MAX_SKIP = 5000;

/** The system log's severities, lowest first (the API takes the name and returns that level and above). */
export const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;

/** The platform parts that write the system log. The API validates the value; this only fills the dropdown. */
export const LOG_APPLICATIONS = [
  'Auth',
  'Valid',
  'AdHocContinuous',
  'AdHocPeriodic',
  'Device',
  'Continuous',
  'Periodic',
  'BiContinuous',
  'BiPeriodic',
  'Issues',
  'Aggregation',
  'Rbac',
  'Test',
] as const;

/** Raw form values (all strings, as typed). `from`/`to` are `datetime-local` values in the viewer's local time. */
export interface AuditFilters {
  from: string;
  to: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
}

export interface SystemFilters {
  from: string;
  to: string;
  minLevel: string;
  application: string;
  deviceId: string;
  sensorId: string;
  userId: string;
  text: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = { from: '', to: '', action: '', entityType: '', entityId: '', actorUserId: '' };
export const EMPTY_SYSTEM_FILTERS: SystemFilters = { from: '', to: '', minLevel: '', application: '', deviceId: '', sensorId: '', userId: '', text: '' };

/** A local `datetime-local` value ("2026-10-21T14:30") as the UTC instant it denotes, or undefined when empty/invalid. */
export function localToUtcIso(value: string): string | undefined {
  if (value.trim() === '') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** A whole, non-negative number from a text field, or undefined (empty or not a number - the filter is then not sent). */
function wholeNumber(value: string): number | undefined {
  const text = value.trim();
  return /^\d+$/.test(text) ? Number(text) : undefined;
}

function text(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function auditQuery(filters: AuditFilters, skip: number, take = LOG_PAGE_SIZE) {
  return {
    from: localToUtcIso(filters.from),
    to: localToUtcIso(filters.to),
    action: text(filters.action),
    entityType: text(filters.entityType),
    entityId: text(filters.entityId),
    actorUserId: wholeNumber(filters.actorUserId),
    skip,
    take,
  };
}

export function systemQuery(filters: SystemFilters, skip: number, take = LOG_PAGE_SIZE) {
  return {
    from: localToUtcIso(filters.from),
    to: localToUtcIso(filters.to),
    minLevel: text(filters.minLevel),
    application: text(filters.application),
    deviceId: wholeNumber(filters.deviceId),
    sensorId: wholeNumber(filters.sensorId),
    userId: wholeNumber(filters.userId),
    text: text(filters.text),
    skip,
    take,
  };
}

/** Whether any filter is set (drives the "no entries match your filters" wording and the Reset button). */
export function hasFilters(filters: Record<string, string>): boolean {
  return Object.values(filters).some((v) => v.trim() !== '');
}
