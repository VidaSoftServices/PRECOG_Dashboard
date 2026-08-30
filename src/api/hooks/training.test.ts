import { describe, it, expect } from 'vitest';
import { trainingRequestsRefetchInterval, trainingRequestRefetchInterval, type TrainingRequestDto } from './training';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';

function request(status: string): TrainingRequestDto {
  return { status } as TrainingRequestDto;
}

describe('trainingRequestsRefetchInterval (list)', () => {
  it('keeps polling while any request in the list is Pending, Claimed, or Processing', () => {
    expect(trainingRequestsRefetchInterval([request('Pending')])).toBe(POLL_INTERVALS_MS.activeJob);
    expect(trainingRequestsRefetchInterval([request('Claimed')])).toBe(POLL_INTERVALS_MS.activeJob);
    expect(trainingRequestsRefetchInterval([request('Processing')])).toBe(POLL_INTERVALS_MS.activeJob);
  });

  it('stops polling once every request is terminal (Completed, Failed, or Cancelled)', () => {
    expect(trainingRequestsRefetchInterval([request('Completed')])).toBe(false);
    expect(trainingRequestsRefetchInterval([request('Failed'), request('Cancelled')])).toBe(false);
  });

  it('keeps polling if even one request among several is still active', () => {
    expect(trainingRequestsRefetchInterval([request('Completed'), request('Pending')])).toBe(POLL_INTERVALS_MS.activeJob);
  });

  it('does not poll an empty or undefined list', () => {
    expect(trainingRequestsRefetchInterval([])).toBe(false);
    expect(trainingRequestsRefetchInterval(undefined)).toBe(false);
  });
});

describe('trainingRequestRefetchInterval (single)', () => {
  it('polls only while Pending, Claimed, or Processing', () => {
    expect(trainingRequestRefetchInterval('Pending')).toBe(POLL_INTERVALS_MS.activeJob);
    expect(trainingRequestRefetchInterval('Claimed')).toBe(POLL_INTERVALS_MS.activeJob);
    expect(trainingRequestRefetchInterval('Processing')).toBe(POLL_INTERVALS_MS.activeJob);
  });

  it('stops at every terminal state', () => {
    expect(trainingRequestRefetchInterval('Completed')).toBe(false);
    expect(trainingRequestRefetchInterval('Failed')).toBe(false);
    expect(trainingRequestRefetchInterval('Cancelled')).toBe(false);
  });

  it('does not poll when there is no status yet', () => {
    expect(trainingRequestRefetchInterval(undefined)).toBe(false);
  });
});
