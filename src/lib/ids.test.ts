import { describe, it, expect } from 'vitest';
import { MAX_EXACT_ID, formatInt64Id } from './ids';

describe('formatInt64Id', () => {
  it('shows an id as plain digits - no separators, no locale formatting', () => {
    expect(formatInt64Id(7)).toEqual({ text: '7', exact: true });
    expect(formatInt64Id(1234567)).toEqual({ text: '1234567', exact: true });
    expect(formatInt64Id(0)).toEqual({ text: '0', exact: true });
  });

  it('the largest exact id is 2^53 - 1 and is shown unchanged', () => {
    expect(MAX_EXACT_ID).toBe(9007199254740991);
    expect(formatInt64Id(9007199254740991)).toEqual({ text: '9007199254740991', exact: true });
  });

  it('refuses to show a value beyond that, because JSON.parse already rounded it', () => {
    // 9007199254740993 cannot be represented: it is parsed as 9007199254740992, a different id.
    const parsed = JSON.parse('{"principalId":9007199254740993}').principalId as number;
    expect(parsed).toBe(9007199254740992);
    expect(formatInt64Id(parsed)).toEqual({ text: '', exact: false });
    expect(formatInt64Id(Number.MAX_SAFE_INTEGER + 2)).toEqual({ text: '', exact: false });
  });

  it('refuses fractions and non-finite numbers, and treats a missing id as empty', () => {
    expect(formatInt64Id(1.5).exact).toBe(false);
    expect(formatInt64Id(Number.NaN).exact).toBe(false);
    expect(formatInt64Id(Number.POSITIVE_INFINITY).exact).toBe(false);
    expect(formatInt64Id(undefined)).toEqual({ text: '', exact: true });
    expect(formatInt64Id(null)).toEqual({ text: '', exact: true });
  });
});
