import { describe, expect, it } from 'vitest';
import { matchToSensors, parseDescriptionSheet } from './descriptionSheet';

const sheet = (...rows: string[]) => ['sensorName,description', ...rows].join('\r\n');

describe('parseDescriptionSheet', () => {
  it('reads the rows and keeps quoted commas, quotes and line breaks of the text', () => {
    const r = parseDescriptionSheet(sheet('a_1,"## RMS\r\nShows, **a lot** of ""things"".\r\n- one\r\n- two"', 'b_1,plain'));
    expect(r.issues).toEqual([]);
    expect(r.rows).toEqual([
      { sensorName: 'a_1', language: 'en', description: '## RMS\nShows, **a lot** of "things".\n- one\n- two', line: 2 },
      { sensorName: 'b_1', language: 'en', description: 'plain', line: 3 },
    ]);
  });

  it('accepts a BOM, semicolons and header aliases, and reports other columns as ignored', () => {
    const r = parseDescriptionSheet(`${String.fromCharCode(0xfeff)}External Sensor Id;Text;Title\na_1;Hello;x`);
    expect(r.issues).toEqual([]);
    expect(r.rows[0]).toMatchObject({ sensorName: 'a_1', description: 'Hello' });
    expect(r.ignoredColumns).toEqual(['Title']);
  });

  it('reports a missing column, an empty sheet and blank / duplicate / empty rows', () => {
    expect(parseDescriptionSheet('').issues[0]!.message).toMatch(/empty/);
    expect(parseDescriptionSheet('description\nB').issues[0]!.message).toMatch(/sensorName/);
    expect(parseDescriptionSheet('sensorName\na_1').issues[0]!.message).toMatch(/"description" column/);

    const r = parseDescriptionSheet(sheet(',text', 'a_1,text', 'a_1,again', 'b_1,'));
    expect(r.rows.map((x) => x.sensorName)).toEqual(['a_1']);
    expect(r.issues.map((i) => i.message)).toEqual(['sensorName is empty.', 'sensorName "a_1" (EN) is already on line 3.', '"b_1" has no description.']);
  });

  it('rejects an over-long text', () => {
    const r = parseDescriptionSheet(sheet(`a_1,${'x'.repeat(8001)}`));
    expect(r.rows).toEqual([]);
    expect(r.issues[0]!.message).toMatch(/description of "a_1" is longer than 8000/);
  });
});

describe('matchToSensors', () => {
  it('separates matched, unknown and undescribed', () => {
    const { rows } = parseDescriptionSheet(sheet('a_1,A', 'zzz,Z'));
    expect(matchToSensors(rows, ['a_1', 'b_1'])).toMatchObject({
      matched: [expect.objectContaining({ sensorName: 'a_1' })],
      unknown: ['zzz'],
      withoutDescription: ['b_1'],
    });
  });
});

describe('language column', () => {
  it('keeps one row per Sensor and language; no column means English', () => {
    const p = parseDescriptionSheet(['sensorName,language,description', 'a_1,EN,about', 'a_1,hu,rólam', 'b_1,,x'].join('\n'));
    expect(p.issues).toEqual([]);
    expect(p.rows.map((r) => [r.sensorName, r.language])).toEqual([['a_1', 'en'], ['a_1', 'hu'], ['b_1', 'en']]);
    expect(parseDescriptionSheet('sensorName,description\na_1,x').rows[0]?.language).toBe('en');
  });
  it('rejects an unknown language and a duplicate Sensor+language', () => {
    const p = parseDescriptionSheet(['sensorName,language,description', 'a_1,de,x', 'a_1,en,y', 'a_1,en,z'].join('\n'));
    expect(p.issues.map((i) => i.line)).toEqual([2, 4]);
  });
});
