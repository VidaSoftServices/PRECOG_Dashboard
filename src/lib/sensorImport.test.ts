import { describe, it, expect } from 'vitest';
import {
  MAX_IMPORT_ROWS,
  TEMPLATE_COLUMNS,
  buildSensorIdMapCsv,
  buildTemplateCsv,
  detectDelimiter,
  parseSensorTable,
  splitDelimited,
  type ImportDefaults,
} from './sensorImport';

const DEFAULTS: ImportDefaults = { direction: 'lowerisbetter', rawScale: 'Seconds', rawLookback: '60', rawMinIssueScore: '1', processingEnabled: true };

describe('detectDelimiter / splitDelimited', () => {
  it('prefers a tab (an Excel paste), then the more frequent of ; and ,', () => {
    expect(detectDelimiter('a\tb;c,d')).toBe('\t');
    expect(detectDelimiter('a;b;c,d')).toBe(';');
    expect(detectDelimiter('a,b,c;d')).toBe(',');
    expect(detectDelimiter('externalSensorId')).toBe(',');
  });

  it('handles quoted fields with delimiters, doubled quotes and newlines, and CRLF', () => {
    const rows = splitDelimited('a,"b,1","say ""hi""","l1\nl2"\r\nx,y,z,w\r\n', ',');
    expect(rows).toEqual([
      ['a', 'b,1', 'say "hi"', 'l1\nl2'],
      ['x', 'y', 'z', 'w'],
    ]);
  });
});

describe('parseSensorTable', () => {
  it('parses an Excel paste (tab separated) and applies the defaults to missing columns', () => {
    const text = 'externalSensorId\tname\tunitCode\ntemp_1\tMotor temperature\tCel\nrpm_1\tShaft speed\t/min';
    const { rows, fileErrors } = parseSensorTable(text, DEFAULTS);

    expect(fileErrors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      line: 2,
      externalSensorId: 'temp_1',
      name: 'Motor temperature',
      unitCode: 'Cel',
      direction: 'lowerisbetter',
      rawScale: 'Seconds',
      rawLookback: 60,
      rawMinIssueScore: 1,
      errors: [],
    });
  });

  it('reads a semicolon-separated file saved by a Hungarian Excel, with a BOM and flexible header names', () => {
    const text = '﻿External Sensor ID;Név;Direction;Raw_Lookback\r\ns1;x;Bidirectional;10\r\n';
    const { rows, ignoredColumns } = parseSensorTable(text, DEFAULTS);

    expect(rows[0]).toMatchObject({ externalSensorId: 's1', direction: 'bidirectional', rawLookback: 10, errors: [] });
    // "Név" is not a known column: reported, not silently swallowed.
    expect(ignoredColumns).toEqual(['Név']);
  });

  it('lets a cell override the default, and an empty cell fall back to it', () => {
    const text = 'externalSensorId,direction,rawScale,rawLookback\na,higherisbetter,minutes,5\nb,,,';
    const { rows } = parseSensorTable(text, DEFAULTS);

    expect(rows[0]).toMatchObject({ direction: 'higherisbetter', rawScale: 'Minutes', rawLookback: 5 });
    expect(rows[1]).toMatchObject({ direction: 'lowerisbetter', rawScale: 'Seconds', rawLookback: 60 });
  });

  it('skips blank lines but keeps the real sheet line numbers', () => {
    const { rows } = parseSensorTable('externalSensorId\na\n\n\nb\n', DEFAULTS);
    expect(rows.map((r) => [r.externalSensorId, r.line])).toEqual([
      ['a', 2],
      ['b', 5],
    ]);
  });

  it('requires an externalSensorId column', () => {
    const { rows, fileErrors } = parseSensorTable('name,unitCode\nx,Cel', DEFAULTS);
    expect(rows).toEqual([]);
    expect(fileErrors[0]).toMatch(/externalSensorId/);
  });

  it('returns nothing, without errors, for empty input', () => {
    expect(parseSensorTable('   \n', DEFAULTS)).toEqual({ rows: [], fileErrors: [], ignoredColumns: [] });
  });

  it('flags a header with no rows', () => {
    expect(parseSensorTable('externalSensorId', DEFAULTS).fileErrors[0]).toMatch(/no Sensor rows/);
  });

  it('flags every kind of bad row so nothing is sent until it is fixed', () => {
    const text = [
      'externalSensorId,direction,rawScale,rawLookback,rawMinIssueScore,unitCode',
      ',lowerisbetter,Seconds,60,1,',
      'dup,sideways,Seconds,60,1,',
      'dup,lowerisbetter,Fortnights,60,1,',
      'ok,lowerisbetter,Seconds,0,1,',
      'ok2,lowerisbetter,Seconds,2.5,1,',
      'ok3,lowerisbetter,Seconds,60,-1,',
      `ok4,lowerisbetter,Seconds,60,1,${'x'.repeat(21)}`,
    ].join('\n');
    const { rows } = parseSensorTable(text, DEFAULTS);
    const errors = rows.map((r) => r.errors.join(' '));

    expect(errors[0]).toMatch(/externalSensorId is empty/);
    expect(errors[1]).toMatch(/direction "sideways"/);
    expect(errors[2]).toMatch(/repeated \(first on line 3\)/);
    expect(errors[2]).toMatch(/rawScale "Fortnights"/);
    expect(errors[3]).toMatch(/rawLookback "0"/);
    expect(errors[4]).toMatch(/rawLookback "2.5"/);
    expect(errors[5]).toMatch(/rawMinIssueScore "-1"/);
    expect(errors[6]).toMatch(/unitCode is longer than 20/);
  });

  it('treats a repeated id case-insensitively, as the API does not distinguish them usefully', () => {
    const { rows } = parseSensorTable('externalSensorId\nAbc\nabc', DEFAULTS);
    expect(rows[1]!.errors.join(' ')).toMatch(/repeated/);
  });

  it('refuses a missing raw scale / lookback instead of inventing one', () => {
    const { rows } = parseSensorTable('externalSensorId\na', { ...DEFAULTS, rawScale: '', rawLookback: '' });
    expect(rows[0]!.errors.join(' ')).toMatch(/rawScale is missing/);
    expect(rows[0]!.errors.join(' ')).toMatch(/rawLookback is missing/);
  });

  it(`rejects a sheet of more than ${MAX_IMPORT_ROWS} rows as a whole`, () => {
    const text = 'externalSensorId\n' + Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `s${i}`).join('\n');
    const result = parseSensorTable(text, DEFAULTS);
    expect(result.rows).toEqual([]);
    expect(result.fileErrors[0]).toMatch(/At most/);
  });

  it('accepts a full 326-row sheet and keeps the sheet order', () => {
    const text = 'externalSensorId\n' + Array.from({ length: 326 }, (_, i) => `kpi_${i}`).join('\n');
    const { rows } = parseSensorTable(text, DEFAULTS);
    expect(rows).toHaveLength(326);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(rows[0]!.externalSensorId).toBe('kpi_0');
    expect(rows[325]!.externalSensorId).toBe('kpi_325');
  });
});

describe('processingEnabled column', () => {
  it('defaults to the dialog default when the column is missing or the cell empty', () => {
    const on = parseSensorTable('externalSensorId\na', DEFAULTS).rows[0]!;
    expect(on.processingEnabled).toBe(true);

    const off = parseSensorTable('externalSensorId,processingEnabled\na,\nb,true', { ...DEFAULTS, processingEnabled: false }).rows;
    expect(off.map((r) => r.processingEnabled)).toEqual([false, true]);
  });

  it.each([
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['no', false],
    ['off', false],
    ['nem', false],
    ['true', true],
    ['1', true],
    ['igen', true],
    ['On', true],
  ])('reads "%s" as %s, under any of the accepted header names', (word, expected) => {
    for (const header of ['processingEnabled', 'Processing', 'data_processing', 'Calculation']) {
      const { rows } = parseSensorTable(`externalSensorId,${header}\na,${word}`, DEFAULTS);
      expect(rows[0]!.processingEnabled).toBe(expected);
      expect(rows[0]!.errors).toEqual([]);
    }
  });

  it('flags a value that is neither true nor false instead of guessing', () => {
    const { rows } = parseSensorTable('externalSensorId,processingEnabled\na,maybe', DEFAULTS);
    expect(rows[0]!.errors.join(' ')).toMatch(/processingEnabled "maybe"/);
  });
});

describe('buildTemplateCsv', () => {
  it('is importable by the importer itself, with a BOM for Excel and every documented column', () => {
    const csv = buildTemplateCsv();
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')[0]).toBe('﻿' + TEMPLATE_COLUMNS.join(','));

    const { rows, fileErrors } = parseSensorTable(csv, { direction: 'lowerisbetter', rawScale: '', rawLookback: '', rawMinIssueScore: '1', processingEnabled: true });
    expect(fileErrors).toEqual([]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.flatMap((r) => r.errors)).toEqual([]);
  });
});

describe('buildSensorIdMapCsv', () => {
  it('lists the numeric ids in id order and quotes names that need it', () => {
    const csv = buildSensorIdMapCsv([
      { externalSensorId: 'b', sensorId: 2, name: 'Has, a comma' },
      { externalSensorId: 'a', sensorId: 1, name: 'Plain' },
    ]);
    expect(csv).toBe('﻿externalSensorId,sensorId,name\r\na,1,Plain\r\nb,2,"Has, a comma"\r\n');
  });
});
