import { describe, it, expect } from 'vitest';
import { TEMPLATE_HEADERS, buildTemplateCsv, parseSensorTable, type ExistingSensorInfo, type ImportDefaults } from './sensorImport';
import { CATALOG } from '@/test/sensorCatalog';

const DEFAULTS: ImportDefaults = { direction: 'lowerisbetter', rawScale: 'Seconds', rawLookback: '60', rawMinIssueScore: '1', processingEnabled: true, visible: true };

describe('the Visible column', () => {
  it('is part of the template, right after Calculate, and every template example row is visible and importable', () => {
    const headers = [...TEMPLATE_HEADERS];
    expect(headers.indexOf('Visible')).toBe(headers.indexOf('Calculate') + 1);

    const { rows, fileErrors } = parseSensorTable(buildTemplateCsv(CATALOG), DEFAULTS, CATALOG);
    expect(fileErrors).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.errors).toEqual([]);
      expect(row.visible).toBe(true);
      expect(row.provided.visible).toBe(true);
    }
  });

  it('takes the dialog default for an empty cell or a missing column, and the cell otherwise', () => {
    const none = parseSensorTable('externalSensorId\na', DEFAULTS, CATALOG).rows;
    expect(none[0]!.visible).toBe(true);
    expect(none[0]!.provided.visible).toBe(false);

    const hiddenByDefault = parseSensorTable('externalSensorId,Visible\na,\nb,true\nc,false', { ...DEFAULTS, visible: false }, CATALOG).rows;
    expect(hiddenByDefault.map((r) => r.visible)).toEqual([false, true, false]);
    expect(hiddenByDefault.map((r) => r.provided.visible)).toEqual([false, true, true]);
  });

  it.each([
    ['true', true],
    ['FALSE', false],
    ['1', true],
    ['0', false],
    ['yes', true],
    ['no', false],
    ['on', true],
    ['off', false],
    ['igen', true],
    ['nem', false],
  ])('reads "%s" as %s', (word, expected) => {
    expect(parseSensorTable(`externalSensorId,Visible\na,${word}`, DEFAULTS, CATALOG).rows[0]!.visible).toBe(expected);
  });

  it.each(['Visible', 'visible', 'Show', 'shown', ' VISIBLE '])('accepts the header spelling "%s"', (header) => {
    const { rows, ignoredColumns } = parseSensorTable(`externalSensorId,${header}\na,false`, DEFAULTS, CATALOG);
    expect(ignoredColumns).toEqual([]);
    expect(rows[0]!.visible).toBe(false);
  });

  it('reports a value it cannot read on the Visible column and blocks the row', () => {
    const { rows } = parseSensorTable('externalSensorId,Visible\na,maybe', DEFAULTS, CATALOG);

    expect(rows[0]!.issues.map((i) => i.field)).toContain('Visible');
    expect(rows[0]!.errors.join(' ')).toMatch(/Visible "maybe" must be true or false/);
  });

  it('applies only a FILLED cell to a Sensor that already exists (an empty cell never overwrites, the dialog default is not applied)', () => {
    const existing = new Map<string, ExistingSensorInfo>([['old_1', { direction: 'lowerisbetter' }]]);

    const empty = parseSensorTable('sensorName,Visible\nold_1,', { ...DEFAULTS, visible: false }, CATALOG, existing).rows[0]!;
    expect(empty.exists).toBe(true);
    expect(empty.provided.visible).toBe(false); // so importSensors leaves the Sensor's own flag alone

    const filled = parseSensorTable('sensorName,Visible\nold_1,false', DEFAULTS, CATALOG, existing).rows[0]!;
    expect(filled.provided.visible).toBe(true);
    expect(filled.visible).toBe(false);
  });
});
