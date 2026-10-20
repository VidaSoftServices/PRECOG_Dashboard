import { describe, it, expect } from 'vitest';
import { buildXlsx, columnLetter, crc32, safeSheetName, xmlEscape } from './xlsxWriter';

interface ZipPart {
  name: string;
  data: Uint8Array;
  crc: number;
}

/** Reads a stored (uncompressed) ZIP through its central directory - the way a spreadsheet application would. */
function readZip(bytes: Uint8Array): ZipPart[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endAt = bytes.length - 22;
  expect(view.getUint32(endAt, true)).toBe(0x06054b50);
  const count = view.getUint16(endAt + 10, true);
  let at = view.getUint32(endAt + 16, true);
  const parts: ZipPart[] = [];
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const localAt = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));

    // The local header must agree with the central directory.
    expect(view.getUint32(localAt, true)).toBe(0x04034b50);
    expect(view.getUint16(localAt + 8, true)).toBe(0); // stored
    expect(view.getUint32(localAt + 14, true)).toBe(crc);
    const localNameLength = view.getUint16(localAt + 26, true);
    const dataAt = localAt + 30 + localNameLength;
    parts.push({ name, data: bytes.subarray(dataAt, dataAt + size), crc });
    at += 46 + nameLength;
  }
  return parts;
}

const text = (part: ZipPart | undefined) => new TextDecoder().decode(part!.data);

describe('xlsx writer', () => {
  const bytes = buildXlsx([
    { name: 'Units', rows: [['code', 'label'], ['g', 'g'], ['one', 'Unit']], columnWidths: [12, 30] },
    { name: 'Numbers & "quotes" <x>', rows: [['n'], [5], [0.25]] },
  ]);
  const parts = readZip(bytes);
  const part = (name: string) => parts.find((p) => p.name === name);

  it('is a valid ZIP with the parts an .xlsx needs and correct checksums', () => {
    expect(parts.map((p) => p.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
    for (const p of parts) expect(crc32(p.data)).toBe(p.crc);
  });

  it('every XML part is well-formed', () => {
    for (const p of parts) {
      const doc = new DOMParser().parseFromString(text(p), 'application/xml');
      expect(doc.getElementsByTagName('parsererror'), p.name).toHaveLength(0);
    }
  });

  it('declares every sheet in the content types, the workbook and its relationships', () => {
    expect(text(part('[Content_Types].xml'))).toContain('/xl/worksheets/sheet2.xml');
    const workbook = text(part('xl/workbook.xml'));
    expect(workbook).toContain('<sheet name="Units" sheetId="1" r:id="rId1"/>');
    expect(workbook).toContain('sheetId="2"');
    expect(text(part('xl/_rels/workbook.xml.rels'))).toContain('Target="worksheets/sheet2.xml"');
  });

  it('writes text as inline strings, numbers as numbers, with a bold frozen header and column widths', () => {
    const sheet = text(part('xl/worksheets/sheet1.xml'));
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">code</t></is></c>');
    expect(sheet).toContain('<c r="B3" t="inlineStr" s="2"><is><t xml:space="preserve">Unit</t></is></c>');
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<col min="2" max="2" width="30" customWidth="1"/>');
    expect(text(part('xl/worksheets/sheet2.xml'))).toContain('<c r="A2"><v>5</v></c>');
  });

  it('a sheet name that Excel would reject is cleaned', () => {
    // The name had : \ / ? * [ ] characters removed, quotes and <> escaped in the XML.
    expect(text(part('xl/workbook.xml'))).toContain('name="Numbers &amp; &quot;quotes&quot; &lt;x&gt;"');
    expect(safeSheetName('a/b:c*d?e[f]g', new Set())).toBe('a b c d e f g');
    expect(safeSheetName('x'.repeat(50), new Set())).toHaveLength(31);
    const taken = new Set<string>();
    expect([safeSheetName('Same', taken), safeSheetName('same', taken)]).toEqual(['Same', 'same 2']);
  });

  it('text that looks like a formula stays text', () => {
    const out = readZip(buildXlsx([{ name: 'S', rows: [['h'], ['=1+1']] }]));
    const sheet = text(out.find((p) => p.name === 'xl/worksheets/sheet1.xml'));
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).not.toContain('<f>');
  });

  it('escapes XML and drops characters XML cannot carry; keeps non-ASCII text', () => {
    expect(xmlEscape('a & <b> "c"')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
    expect(xmlEscape('x\u0000y\u0008z\ud800')).toBe('xyz');
    expect(xmlEscape('tab\tline\n°C - Relatív')).toBe('tab\tline\n°C - Relatív');
  });

  it('column letters', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  it('is reproducible - the same input gives the same bytes', () => {
    const again = buildXlsx([{ name: 'S', rows: [['h'], ['v']] }]);
    expect(Array.from(again)).toEqual(Array.from(buildXlsx([{ name: 'S', rows: [['h'], ['v']] }])));
  });

  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});
