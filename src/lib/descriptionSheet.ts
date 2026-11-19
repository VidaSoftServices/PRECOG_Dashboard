import type { Language } from './language';
import { detectDelimiter, normalizeHeader, splitDelimited } from './sensorImport';

/**
 * "Indicator descriptions" of a Device: one sheet (CSV) per Device, one row per Sensor. `sensorName` is the Sensor's
 * `externalSensorId` and identifies it exactly; `description` is the whole text shown at that indicator, written with the Azure DevOps
 * markdown basics (`## heading`, `**bold**`, `- list`, ...; see `markdownLite.ts`). Everything else - what the indicator family is
 * for, what this indicator shows, what it can point to, what to read it with, limitations - lives inside that one text.
 * Pure, no React: parsing, validation and matching against the Device's Sensors.
 *
 * Columns (case-insensitive, spaces/underscores/dashes ignored): `sensorName` (required) and `description` (required on every row).
 * Other columns are reported as ignored.
 */
const BOM = String.fromCharCode(0xfeff);

export const DESCRIPTION_COLUMNS = ['sensorName', 'language', 'description'] as const;
export type DescriptionColumn = (typeof DESCRIPTION_COLUMNS)[number];

export const MAX_DESCRIPTION_ROWS = 2000;
export const MAX_DESCRIPTION_TEXT = 8000;

export interface DescriptionRow {
  sensorName: string;
  /** The language of the text: one row per Sensor and language. A sheet without a language column is English. */
  language: Language;
  /** Markdown text (Azure DevOps basics). */
  description: string;
  /** 1-based line of the sheet, for messages. */
  line: number;
}

export interface DescriptionIssue {
  line: number;
  message: string;
}

export interface ParsedDescriptions {
  rows: DescriptionRow[];
  issues: DescriptionIssue[];
  /** Header names found but not understood (ignored). */
  ignoredColumns: string[];
}

const ALIASES: Record<string, DescriptionColumn> = {
  sensorname: 'sensorName',
  externalsensorid: 'sensorName',
  sensorid: 'sensorName',
  machinename: 'sensorName',
  language: 'language',
  lang: 'language',
  nyelv: 'language',
  description: 'description',
  text: 'description',
  info: 'description',
};

const LANGUAGE_VALUES: Record<string, Language> = { en: 'en', eng: 'en', english: 'en', hu: 'hu', hun: 'hu', hungarian: 'hu', magyar: 'hu' };

export function parseDescriptionSheet(text: string): ParsedDescriptions {
  const issues: DescriptionIssue[] = [];
  const clean = text.startsWith(BOM) ? text.slice(1) : text;
  const firstLine = clean.split(/\r\n|\n|\r/, 1)[0] ?? '';
  if (firstLine.trim() === '') return { rows: [], issues: [{ line: 1, message: 'The sheet is empty.' }], ignoredColumns: [] };

  const table = splitDelimited(clean, detectDelimiter(firstLine));
  const header = table[0] ?? [];
  const index = new Map<DescriptionColumn, number>();
  const ignoredColumns: string[] = [];
  header.forEach((h, i) => {
    const column = ALIASES[normalizeHeader(h)];
    if (column && !index.has(column)) index.set(column, i);
    else if (h.trim() !== '') ignoredColumns.push(h.trim());
  });

  if (!index.has('sensorName')) {
    return { rows: [], issues: [{ line: 1, message: 'The first row must be a header with a "sensorName" column (the Sensor\'s external id).' }], ignoredColumns };
  }
  if (!index.has('description')) {
    return { rows: [], issues: [{ line: 1, message: 'The header needs a "description" column (the text shown at the indicator).' }], ignoredColumns };
  }
  const nameAt = index.get('sensorName')!;
  const descriptionAt = index.get('description')!;
  const languageAt = index.get('language');

  const rows: DescriptionRow[] = [];
  const seen = new Map<string, number>();
  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r]!;
    if (cells.every((c) => c.trim() === '')) continue;
    const line = r + 1;
    if (rows.length >= MAX_DESCRIPTION_ROWS) {
      issues.push({ line, message: `Too many rows - at most ${MAX_DESCRIPTION_ROWS} per sheet.` });
      break;
    }
    const sensorName = (cells[nameAt] ?? '').trim();
    if (sensorName === '') {
      issues.push({ line, message: 'sensorName is empty.' });
      continue;
    }
    let language: Language = 'en';
    if (languageAt !== undefined) {
      const raw = (cells[languageAt] ?? '').trim().toLowerCase();
      const parsedLanguage = LANGUAGE_VALUES[raw];
      if (raw !== '' && !parsedLanguage) {
        issues.push({ line, message: `language "${raw}" is not understood - use EN or HU.` });
        continue;
      }
      language = parsedLanguage ?? 'en';
    }
    const key = `${sensorName}|${language}`;
    const previous = seen.get(key);
    if (previous !== undefined) {
      issues.push({ line, message: `sensorName "${sensorName}" (${language.toUpperCase()}) is already on line ${previous}.` });
      continue;
    }
    // Line breaks inside the cell are the text's own; only the ends are trimmed.
    const description = (cells[descriptionAt] ?? '').replace(/\r\n?/g, '\n').trim();
    if (description === '') {
      issues.push({ line, message: `"${sensorName}" has no description.` });
      continue;
    }
    if (description.length > MAX_DESCRIPTION_TEXT) {
      issues.push({ line, message: `description of "${sensorName}" is longer than ${MAX_DESCRIPTION_TEXT} characters.` });
      continue;
    }
    seen.set(key, line);
    rows.push({ sensorName, language, description, line });
  }
  return { rows, issues, ignoredColumns };
}

export interface MatchResult {
  /** Rows whose sensorName is a Sensor of the Device. */
  matched: DescriptionRow[];
  /** sensorName values of the sheet that are not a Sensor of the Device. */
  unknown: string[];
  /** Sensors of the Device that have no row. */
  withoutDescription: string[];
}

export function matchToSensors(rows: readonly DescriptionRow[], sensorNames: readonly string[]): MatchResult {
  const known = new Set(sensorNames);
  const described = new Set(rows.map((r) => r.sensorName));
  return {
    matched: rows.filter((r) => known.has(r.sensorName)),
    unknown: [...new Set(rows.filter((r) => !known.has(r.sensorName)).map((r) => r.sensorName))],
    withoutDescription: sensorNames.filter((n) => !described.has(n)),
  };
}
