import { describe, it, expect } from 'vitest';
import { familyFor, isCurveFamily, isBidirectionalFamily } from './telemetry';

describe('familyFor', () => {
  it('maps continuous + unidirectional to continuous', () => {
    expect(familyFor('continuous', 'lowerisbetter')).toBe('continuous');
  });

  it('maps continuous + bidirectional to bidirectionalContinuous', () => {
    expect(familyFor('continuous', 'bidirectional')).toBe('bidirectionalContinuous');
  });

  it('maps periodic + unidirectional to periodic', () => {
    expect(familyFor('periodic', 'higherisbetter')).toBe('periodic');
  });

  it('maps periodic + bidirectional to bidirectionalPeriodic', () => {
    expect(familyFor('periodic', 'bidirectional')).toBe('bidirectionalPeriodic');
  });

  it('treats missing direction as unidirectional (never guesses bidirectional)', () => {
    expect(familyFor('continuous', null)).toBe('continuous');
    expect(familyFor('continuous', undefined)).toBe('continuous');
  });
});

describe('isCurveFamily / isBidirectionalFamily', () => {
  it('identifies the two curve families', () => {
    expect(isCurveFamily('periodic')).toBe(true);
    expect(isCurveFamily('bidirectionalPeriodic')).toBe(true);
    expect(isCurveFamily('continuous')).toBe(false);
    expect(isCurveFamily('bidirectionalContinuous')).toBe(false);
  });

  it('identifies the two bidirectional families', () => {
    expect(isBidirectionalFamily('bidirectionalContinuous')).toBe(true);
    expect(isBidirectionalFamily('bidirectionalPeriodic')).toBe(true);
    expect(isBidirectionalFamily('continuous')).toBe(false);
    expect(isBidirectionalFamily('periodic')).toBe(false);
  });
});
