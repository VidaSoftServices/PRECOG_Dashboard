import { describe, it, expect } from 'vitest';
import { isSafeHttpsUrl } from './safeExternalUrl';

describe('isSafeHttpsUrl', () => {
  it('accepts a well-formed https URL', () => {
    expect(isSafeHttpsUrl('https://example.invalid/logo.png')).toBe(true);
  });

  it('rejects http (not https)', () => {
    expect(isSafeHttpsUrl('http://example.invalid/logo.png')).toBe(false);
  });

  it('rejects javascript: and data: schemes', () => {
    expect(isSafeHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpsUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects a bare/relative string that is not a valid absolute URL', () => {
    expect(isSafeHttpsUrl('example-logo.png')).toBe(false);
  });

  it('rejects null, undefined, and empty string', () => {
    expect(isSafeHttpsUrl(null)).toBe(false);
    expect(isSafeHttpsUrl(undefined)).toBe(false);
    expect(isSafeHttpsUrl('')).toBe(false);
  });
});
