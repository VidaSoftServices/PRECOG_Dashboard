import { describe, it, expect } from 'vitest';
import { EMPTY_AUDIT_FILTERS, EMPTY_SYSTEM_FILTERS, LOG_PAGE_SIZE, auditQuery, hasFilters, localToUtcIso, systemQuery } from './logFilters';

describe('log filters -> API query', () => {
  it('asks for the newest 30 entries by default, with no filters', () => {
    expect(LOG_PAGE_SIZE).toBe(30);
    expect(auditQuery(EMPTY_AUDIT_FILTERS, 0)).toEqual({
      from: undefined, to: undefined, action: undefined, entityType: undefined, entityId: undefined, actorUserId: undefined, skip: 0, take: 30,
    });
    expect(systemQuery(EMPTY_SYSTEM_FILTERS, 30)).toMatchObject({ skip: 30, take: 30, minLevel: undefined, text: undefined });
  });

  it('sends only the filters that were filled, trimmed', () => {
    const q = auditQuery({ ...EMPTY_AUDIT_FILTERS, action: '  device.  ', entityType: 'Device', actorUserId: ' 12 ' }, 0);
    expect(q).toMatchObject({ action: 'device.', entityType: 'Device', entityId: undefined, actorUserId: 12 });

    const s = systemQuery({ ...EMPTY_SYSTEM_FILTERS, minLevel: 'WARNING', application: 'Device', deviceId: '4', text: ' timeout ' }, 0);
    expect(s).toMatchObject({ minLevel: 'WARNING', application: 'Device', deviceId: 4, text: 'timeout', sensorId: undefined, userId: undefined });
  });

  it('only whole numbers are sent as ids - anything else leaves the filter out instead of sending garbage', () => {
    expect(auditQuery({ ...EMPTY_AUDIT_FILTERS, actorUserId: 'abc' }, 0).actorUserId).toBeUndefined();
    expect(auditQuery({ ...EMPTY_AUDIT_FILTERS, actorUserId: '1.5' }, 0).actorUserId).toBeUndefined();
    expect(auditQuery({ ...EMPTY_AUDIT_FILTERS, actorUserId: '-3' }, 0).actorUserId).toBeUndefined();
    expect(systemQuery({ ...EMPTY_SYSTEM_FILTERS, deviceId: '0' }, 0).deviceId).toBe(0);
  });

  it('a local date-time is sent as the UTC instant it denotes', () => {
    const local = '2026-10-21T14:30';
    expect(localToUtcIso(local)).toBe(new Date(local).toISOString());
    expect(localToUtcIso(local)).toMatch(/Z$/);
    expect(localToUtcIso('')).toBeUndefined();
    expect(localToUtcIso('not a date')).toBeUndefined();
    expect(auditQuery({ ...EMPTY_AUDIT_FILTERS, from: local }, 0).from).toBe(new Date(local).toISOString());
  });

  it('knows whether any filter is set', () => {
    expect(hasFilters({ ...EMPTY_AUDIT_FILTERS })).toBe(false);
    expect(hasFilters({ ...EMPTY_AUDIT_FILTERS, action: ' ' })).toBe(false);
    expect(hasFilters({ ...EMPTY_SYSTEM_FILTERS, text: 'x' })).toBe(true);
  });
});
