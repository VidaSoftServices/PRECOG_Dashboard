import { describe, expect, it } from 'vitest';
import { parseLinkFragment, withoutFragment } from './linkToken';

describe('parseLinkFragment', () => {
  it('reads the token and the language from the fragment of an e-mail link', () => {
    expect(parseLinkFragment('#token=AbC-123_xyz&lang=hu')).toEqual({ token: 'AbC-123_xyz', language: 'hu' });
    expect(parseLinkFragment('token=abc&lang=en')).toEqual({ token: 'abc', language: 'en' });
  });

  it('has no token for a missing, empty or whitespace token, and ignores an unknown language', () => {
    expect(parseLinkFragment('')).toEqual({ token: null, language: null });
    expect(parseLinkFragment('#token=&lang=hu')).toEqual({ token: null, language: 'hu' });
    expect(parseLinkFragment('#token=%20%20')).toEqual({ token: null, language: null });
    expect(parseLinkFragment('#token=abc&lang=de')).toEqual({ token: 'abc', language: null });
  });

  it('decodes a percent-encoded token', () => {
    expect(parseLinkFragment('#token=a%2Bb%3D').token).toBe('a+b=');
  });
});

describe('withoutFragment', () => {
  it('keeps the path and the query, drops the fragment', () => {
    expect(withoutFragment({ pathname: '/accept-invite', search: '?x=1' })).toBe('/accept-invite?x=1');
    expect(withoutFragment({ pathname: '/reset-password', search: '' })).toBe('/reset-password');
  });
});
