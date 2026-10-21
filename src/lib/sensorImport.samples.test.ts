import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSensorTable } from './sensorImport';
import { CATALOG } from '@/test/sensorCatalog';

const here = dirname(fileURLToPath(import.meta.url));
const sample = (name: string) => readFileSync(join(here, '..', '..', 'samples', name), 'utf-8');

/** What the user types into the dialog's default fields; the sample files deliberately leave scale/lookback empty. */
const DEFAULTS = { direction: 'lowerisbetter' as const, rawScale: 'Seconds', rawLookback: '60', rawMinIssueScore: '1', processingEnabled: true };

describe('sample import files (samples/)', () => {
  it('the sample sheets carry the unit and no aggregation columns', () => {
    for (const name of ['vibration-duo-1-point-163-sensors.csv', 'vibration-duo-2-points-326-sensors.csv']) {
      const header = sample(name).replace(/^\uFEFF/, '').split(/\r?\n/)[0]!.split(',');
      expect(header).toContain('unitCode');
      expect(header.join(',')).not.toMatch(/aggregation/i);
      expect(header.slice(0, 2)).toEqual(['sensorName', 'displayName']);
    }
  });

  it('the 1-point Vibration Duo sheet is exactly 163 valid, unique Sensors', () => {
    const { rows, fileErrors } = parseSensorTable(sample('vibration-duo-1-point-163-sensors.csv'), DEFAULTS, CATALOG);
    expect(fileErrors).toEqual([]);
    expect(rows).toHaveLength(163);
    expect(rows.flatMap((r) => r.errors)).toEqual([]);
    expect(rows.every((r) => r.externalSensorId.endsWith('_1'))).toBe(true);
    expect(new Set(rows.map((r) => r.externalSensorId)).size).toBe(163);
    // Every row carries exactly its catalog metric's unit.
    rows.forEach((r, i) => expect(r.unitCode).toBe(CATALOG.metrics[i]!.unitCode));
  });

  it('the 2-point sheet is exactly 326 valid, unique Sensors (point 1 then point 2)', () => {
    const { rows, fileErrors } = parseSensorTable(sample('vibration-duo-2-points-326-sensors.csv'), DEFAULTS, CATALOG);
    expect(fileErrors).toEqual([]);
    expect(rows).toHaveLength(326);
    expect(rows.flatMap((r) => r.errors)).toEqual([]);
    expect(new Set(rows.map((r) => r.externalSensorId)).size).toBe(326);
    expect(rows.slice(0, 163).every((r) => r.externalSensorId.endsWith('_1'))).toBe(true);
    expect(rows.slice(163).every((r) => r.externalSensorId.endsWith('_2'))).toBe(true);
  });

  it('without defaults the sheets are refused, so scale and lookback are never silently invented', () => {
    const { rows } = parseSensorTable(sample('vibration-duo-1-point-163-sensors.csv'), { ...DEFAULTS, rawScale: '', rawLookback: '' }, CATALOG);
    expect(rows.every((r) => r.errors.length > 0)).toBe(true);
  });
});
