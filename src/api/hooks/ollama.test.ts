import { describe, it, expect } from 'vitest';
import { ollamaRefetchInterval } from './ollama';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';

describe('ollamaRefetchInterval', () => {
  it('keeps polling while the job is Queued or Processing', () => {
    expect(ollamaRefetchInterval('Queued')).toBe(POLL_INTERVALS_MS.activeJob);
    expect(ollamaRefetchInterval('Processing')).toBe(POLL_INTERVALS_MS.activeJob);
  });

  it('stops polling at the real terminal-success value "Succeeded", not the documented-but-wrong "Completed"', () => {
    expect(ollamaRefetchInterval('Succeeded')).toBe(false);
    // "Completed" never actually occurs on the wire (see domainTypes.ts D4) -
    // if it somehow did, it must NOT be mistaken for a terminal state, since
    // that would strand a still-running job's polling.
    expect(ollamaRefetchInterval('Completed' as never)).toBe(POLL_INTERVALS_MS.activeJob);
  });

  it('stops polling on Failed and Cancelled', () => {
    expect(ollamaRefetchInterval('Failed')).toBe(false);
    expect(ollamaRefetchInterval('Cancelled')).toBe(false);
  });

  it('does not poll when there is no status yet', () => {
    expect(ollamaRefetchInterval(undefined)).toBe(false);
  });
});
