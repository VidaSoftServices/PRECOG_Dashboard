import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translate } from './language';
import { HU } from './translations';

const root = resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?)$/.test(name) && !/\.test\.|schema\.generated|translations/.test(name) ? [full] : [];
  });
}

// Names of columns, codes and sample text that are shown as they are in every language.
const AS_IS = new Set(['PRECOG', 'EN', 'HU', 'IP', '## heading', '**bold**', '- list']);
const isCode = (key: string) => AS_IS.has(key) || /^[a-z][A-Za-z0-9]*$/.test(key);

describe('Hungarian texts', () => {
  it('has a Hungarian text for every t(\'...\') in the application', () => {
    const missing = new Set<string>();
    const call = /\bt\('((?:[^'\\]|\\.)*)'/g;
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(call)) {
        const key = (m[1] ?? '').replaceAll("\\'", "'").replaceAll('\\\\', '\\').replaceAll('\\n', '\n');
        if (!isCode(key) && !(key in HU)) missing.add(key);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('translates only into Hungarian, fills the placeholders and falls back to the English text', () => {
    expect(translate('Overview', 'hu')).toBe('Áttekintés');
    expect(translate('Overview', 'en')).toBe('Overview');
    expect(translate('Delete {0} setpoint(s)', 'hu', [3])).toBe('3 célérték-beállítás törlése');
    expect(translate('Delete {0} setpoint(s)', 'en', [3])).toBe('Delete 3 setpoint(s)');
    expect(translate('A text nobody translated', 'hu')).toBe('A text nobody translated');
  });
});
