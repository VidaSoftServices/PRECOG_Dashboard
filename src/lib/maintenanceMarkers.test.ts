import { describe, expect, it } from 'vitest';
import { maintenanceMarkers, pixelOfInstant, type MaintenanceRecordLike } from './maintenanceMarkers';

const replacement: MaintenanceRecordLike = {
  sensorId: 1,
  startedAt: '2026-03-12T06:00:00Z',
  endedAt: '2026-03-12T14:20:00Z',
  kind: 'Replacement',
  warmUps: [
    { policyId: 10, timeScale: 'Native', warmUpEndsAt: '2026-03-13T14:20:00Z' },
    { policyId: 11, timeScale: 'Days', warmUpEndsAt: '2026-03-26T14:20:00Z' },
  ],
};

describe('maintenanceMarkers', () => {
  it('marks the finished maintenances of the chosen Sensors only', () => {
    const records: MaintenanceRecordLike[] = [
      replacement,
      { sensorId: 2, startedAt: '2026-04-01T08:00:00Z', endedAt: '2026-04-01T09:00:00Z', kind: 'Minor' },
      { sensorId: 1, startedAt: '2026-11-19T08:00:00Z', endedAt: null, kind: null }, // still going on
    ];
    const markers = maintenanceMarkers(records, [1]);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ kind: 'Replacement', endedAt: '2026-03-12T14:20:00Z' });
  });

  it('a replacement carries the warm-up of the level the chart shows: raw by default, the chosen level otherwise', () => {
    expect(maintenanceMarkers([replacement], [1])[0]!.warmUpEndsAt).toBe('2026-03-13T14:20:00Z');
    expect(maintenanceMarkers([replacement], [1], 11)[0]!.warmUpEndsAt).toBe('2026-03-26T14:20:00Z');
    expect(maintenanceMarkers([replacement], [1], (sensorId) => (sensorId === 1 ? 11 : undefined))[0]!.warmUpEndsAt).toBe('2026-03-26T14:20:00Z');
    expect(maintenanceMarkers([replacement], [1], 99)[0]!.warmUpEndsAt).toBeNull(); // a level without a warm-up in the response: none invented
  });

  it('a minor maintenance has no warm-up; an unknown kind counts as minor', () => {
    const markers = maintenanceMarkers([{ ...replacement, kind: 'Minor' }, { ...replacement, startedAt: '2026-05-01T00:00:00Z', kind: 'Something' }], [1]);
    expect(markers.every((m) => m.kind === 'Minor' && m.warmUpEndsAt === null)).toBe(true);
  });

  it('the same maintenance of several Sensors is one marker, sorted by end', () => {
    const second = { ...replacement, sensorId: 2 };
    const earlier = { sensorId: 2, startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T01:00:00Z', kind: 'Minor' };
    const markers = maintenanceMarkers([replacement, second, earlier], [1, 2]);
    expect(markers.map((m) => m.endedAt)).toEqual(['2026-01-01T01:00:00Z', '2026-03-12T14:20:00Z']);
  });

  it('keeps the manual-baseline flag', () => {
    const manual = { sensorId: 1, startedAt: '2026-06-01T00:00:00Z', endedAt: '2026-06-01T00:00:00Z', kind: 'Replacement', manualBaseline: true };
    expect(maintenanceMarkers([manual], [1])[0]!.manualBaseline).toBe(true);
  });
});

describe('pixelOfInstant', () => {
  const labels = ['2026-03-12T00:00:00Z', '2026-03-12T10:00:00Z', '2026-03-12T20:00:00Z'];
  const pixelOf = (i: number) => 100 + i * 50; // 100, 150, 200

  it('interpolates between the two neighbouring instants', () => {
    expect(pixelOfInstant(labels, '2026-03-12T05:00:00Z', pixelOf)).toBe(125);
    expect(pixelOfInstant(labels, '2026-03-12T10:00:00Z', pixelOf)).toBe(150);
    expect(pixelOfInstant(labels, '2026-03-12T18:00:00Z', pixelOf)).toBe(190);
  });

  it('is null outside the plotted range', () => {
    expect(pixelOfInstant(labels, '2026-03-11T23:00:00Z', pixelOf)).toBeNull();
    expect(pixelOfInstant(labels, '2026-03-13T00:00:00Z', pixelOf)).toBeNull();
    expect(pixelOfInstant([], '2026-03-12T05:00:00Z', pixelOf)).toBeNull();
  });
});
