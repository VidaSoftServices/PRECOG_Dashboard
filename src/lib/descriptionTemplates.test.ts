import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_DESCRIPTION_TEXT, parseDescriptionSheet } from './descriptionSheet';
import { parseMarkdown } from './markdownLite';

// The two sheets behind the Import descriptions dialog's "Template: pump / fan" downloads (public/templates).
const read = (name: string) => readFileSync(resolve(__dirname, '../../public/templates', name), 'utf8');

describe.each(['description-template-pump-162.csv', 'description-template-fan-162.csv'])('%s', (file) => {
  const parsed = parseDescriptionSheet(read(file));

  it('is a valid sheet of 162 indicators in English and Hungarian with no problem and no ignored column', () => {
    expect(parsed.issues).toEqual([]);
    expect(parsed.ignoredColumns).toEqual([]);
    expect(parsed.rows).toHaveLength(324);
    expect(new Set(parsed.rows.map((r) => r.sensorName)).size).toBe(162);
    expect(parsed.rows.filter((r) => r.language === 'hu')).toHaveLength(162);
  });

  it('starts with what the group is for, then what the indicator shows, and stays within the limit', () => {
    for (const row of parsed.rows) {
      expect(row.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_TEXT);
      const blocks = parseMarkdown(row.description);
      expect(blocks[0]).toMatchObject({ t: 'heading', level: 2 });
      expect(blocks.filter((b) => b.t === 'heading' && b.level === 2)).toHaveLength(2);
      expect(blocks.some((b) => b.t === 'ul')).toBe(true);
    }
  });

  it('names the machine it is written for', () => {
    const machine = file.includes('pump') ? 'pump' : 'fan';
    expect(parsed.rows.filter((r) => r.language === 'en').some((r) => new RegExp(`For an? ${machine} `).test(r.description))).toBe(true);
  });
});
