import { describe, it, expect } from 'vitest';
import { DATA_SETS_FILE_NAME, buildDataSetsSheets, buildDataSetsWorkbook } from './sensorDataSets';
import { DIRECTIONS, FALSE_WORDS, SCALES, TEMPLATE_HEADERS, TRUE_WORDS, parseSensorTable, type ImportDefaults } from './sensorImport';
import { CATALOG } from '@/test/sensorCatalog';

const DEFAULTS: ImportDefaults = { direction: 'lowerisbetter', rawScale: 'Seconds', rawLookback: '60', rawMinIssueScore: '1', processingEnabled: true };

const sheets = buildDataSetsSheets(CATALOG);
const sheet = (name: string) => sheets.find((s) => s.name === name)!;
const firstColumn = (name: string) => sheet(name).rows.slice(1).map((r) => r[0]);

describe('the "Data sets" workbook', () => {
  it('has one sheet per selectable field plus an overview', () => {
    expect(sheets.map((s) => s.name)).toEqual(['Overview', 'direction', 'rawScale', 'Calculate', 'unitCode', 'Known metrics']);
    expect(DATA_SETS_FILE_NAME).toBe('sensor-import-data-sets.xlsx');
  });

  it('lists every column of the import template in the overview', () => {
    const fields = sheet('Overview').rows.slice(1).map((r) => r[0]);
    for (const header of TEMPLATE_HEADERS) expect(fields).toContain(header);
  });

  it('lists exactly the values the importer accepts for direction, scale and the calculation switch', () => {
    expect(firstColumn('direction')).toEqual([...DIRECTIONS]);
    expect(firstColumn('rawScale')).toEqual([...SCALES]);
    expect(firstColumn('Calculate')).toEqual([...TRUE_WORDS, ...FALSE_WORDS]);

    // ...and the importer really takes each of them.
    for (const direction of firstColumn('direction')) {
      const row = parseSensorTable(`sensorName,direction\nx_1,${direction}`, DEFAULTS, CATALOG).rows[0]!;
      expect(row.issues.filter((i) => i.field === 'direction'), String(direction)).toEqual([]);
    }
    for (const scale of firstColumn('rawScale')) {
      expect(parseSensorTable(`sensorName,rawScale\nx_1,${scale}`, DEFAULTS, CATALOG).rows[0]!.issues.filter((i) => i.field === 'rawScale')).toEqual([]);
    }
    for (const word of firstColumn('Calculate')) {
      expect(parseSensorTable(`sensorName,Calculate\nx_1,${word}`, DEFAULTS, CATALOG).rows[0]!.issues.filter((i) => i.field === 'Calculate')).toEqual([]);
    }
  });

  it('takes the units from the API catalog, with their labels - and has no aggregation sheet any more', () => {
    expect(firstColumn('unitCode')).toEqual(CATALOG.units.map((u) => u.code));
    expect(sheet('unitCode').rows).toContainEqual(['one', 'Unit', 'Unit']);
    expect(sheet('unitCode').rows).toContainEqual(['raw_energy', 'Relative spectrum energy', expect.stringContaining('spektrum')]);
    expect(sheets.some((s) => /aggregation/i.test(s.name))).toBe(false);
    expect(JSON.stringify(sheets)).not.toMatch(/aggregation/i);
  });

  it('lists all 163 known metrics with their exact unit and its label', () => {
    const rows = sheet('Known metrics').rows.slice(1);
    expect(rows).toHaveLength(163);
    expect(new Set(rows.map((r) => r[0])).size).toBe(163);
    for (const metric of CATALOG.metrics) {
      expect(rows).toContainEqual([metric.machineName, metric.displayName, metric.unitCode, CATALOG.units.find((u) => u.code === metric.unitCode)!.label]);
    }
  });

  it('every known metric row, used as the workbook says (machine name + _1), imports without a problem', () => {
    const lines = sheet('Known metrics').rows.slice(1).map((r) => [`${r[0]}_1`, r[2]].join(','));
    const { rows, fileErrors } = parseSensorTable(['sensorName,unitCode', ...lines].join('\n'), DEFAULTS, CATALOG);
    expect(fileErrors).toEqual([]);
    expect(rows.filter((r) => r.errors.length > 0)).toEqual([]);
  });

  it('builds a real workbook (a ZIP starting with PK)', () => {
    const bytes = buildDataSetsWorkbook(CATALOG);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(bytes.length).toBeGreaterThan(20_000);
  });
});
