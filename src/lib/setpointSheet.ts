import {
  SETPOINT_COLUMNS,
  csvField,
  detectDelimiter,
  normalizeHeader,
  readSetpoint,
  splitDelimited,
  type SensorDirection,
  type SetpointColumn,
  type SetpointValues,
} from '@/lib/sensorImport';

/**
 * The "Manage Setpoints" sheet: one row per Setpoint interval of a Sensor, exported for all Sensors of a Device and imported
 * back as the complete truth for the Sensors it mentions.
 *
 * Semantics of an import (planSetpointSync):
 *  - a Sensor that appears in the sheet gets EXACTLY the intervals of its rows: an interval that is stored but has no row any more
 *    is deleted, a row with no stored interval is created, an interval whose values or validTo differ is replaced;
 *  - a Sensor that appears with only an empty row (just its name) has all its Setpoints deleted;
 *  - a Sensor that does not appear at all is not touched.
 * An interval is identified by its validFrom.
 */
export const SETPOINT_SHEET_HEADERS = ['sensorName', 'validFrom', 'validTo', ...SETPOINT_COLUMNS] as const;

export const MAX_SETPOINT_ROWS = 5000;

const BOM = String.fromCharCode(0xfeff);

export interface SheetSensor {
  id: number;
  externalSensorId: string;
  direction: SensorDirection;
}

/** A stored interval, as the Device-wide listing returns it. */
export interface ExistingInterval {
  id: number;
  sensorId: number;
  validFrom: string;
  validTo?: string | null;
  target?: number | null;
  tolerance?: number | null;
  targetAbove?: number | null;
  targetBelow?: number | null;
  toleranceAbove?: number | null;
  toleranceBelow?: number | null;
}

// ---- export ------------------------------------------------------------------------------------------------------------------------

/** UTC ISO instant without the milliseconds when they are zero: 2026-10-21T00:00:00Z. */
export function formatInstant(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

function instantMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Every Sensor with every one of its intervals, ordered by Sensor id then validFrom. A Sensor without any interval still gets a row
 * (just its name) so it can be filled in; clearing a Sensor's rows down to that empty row deletes its Setpoints on import.
 */
export function buildSetpointsExportCsv(sensors: readonly { id: number; externalSensorId: string }[], intervals: readonly ExistingInterval[]): string {
  const bySensor = new Map<number, ExistingInterval[]>();
  for (const interval of intervals) bySensor.set(interval.sensorId, [...(bySensor.get(interval.sensorId) ?? []), interval]);

  const lines: string[] = [];
  for (const sensor of [...sensors].sort((a, b) => a.id - b.id)) {
    const own = (bySensor.get(sensor.id) ?? []).sort((a, b) => (instantMs(a.validFrom) ?? 0) - (instantMs(b.validFrom) ?? 0));
    if (own.length === 0) {
      lines.push([sensor.externalSensorId, '', '', '', '', '', '', '', ''].map(csvField).join(','));
      continue;
    }
    for (const interval of own) {
      const from = instantMs(interval.validFrom);
      const to = instantMs(interval.validTo);
      lines.push(
        [
          sensor.externalSensorId,
          from === null ? '' : formatInstant(from),
          to === null ? '' : formatInstant(to),
          ...SETPOINT_COLUMNS.map((column) => interval[column] ?? ''),
        ]
          .map(csvField)
          .join(','),
      );
    }
  }
  return BOM + [SETPOINT_SHEET_HEADERS.join(','), ...lines].join('\r\n') + '\r\n';
}

export function setpointsExportFileName(deviceId: number): string {
  return `setpoints-device-${deviceId}.csv`;
}

// ---- import: parsing -------------------------------------------------------------------------------------------------------------

export interface SheetIssue {
  /** 1-based line in the pasted sheet (header = 1). */
  line: number;
  field: string;
  value: string;
  message: string;
}

export interface DesiredInterval {
  line: number;
  validFromMs: number;
  /** null = open-ended. */
  validToMs: number | null;
  values: SetpointValues;
  /** The row had no validFrom: it is the Sensor's only row, so it starts at the moment of the import. */
  validFromDefaulted: boolean;
}

export interface SheetSensorEntry {
  sensor: SheetSensor;
  /** Sorted by validFrom. Empty = the Sensor appears with no Setpoint rows: all its Setpoints are to be deleted. */
  desired: DesiredInterval[];
}

export interface SetpointSheetResult {
  entries: SheetSensorEntry[];
  issues: SheetIssue[];
  /** Problems with the sheet as a whole (no header, no setpoint columns, too many rows...). */
  fileErrors: string[];
  ignoredColumns: string[];
  rowCount: number;
}

type SheetColumn = 'sensorName' | 'validFrom' | 'validTo' | SetpointColumn;

const COLUMN_ALIASES: Record<string, SheetColumn> = {
  sensorname: 'sensorName',
  externalsensorid: 'sensorName',
  machinename: 'sensorName',
  validfrom: 'validFrom',
  from: 'validFrom',
  validto: 'validTo',
  to: 'validTo',
  until: 'validTo',
  target: 'target',
  tolerance: 'tolerance',
  targetabove: 'targetAbove',
  targetbelow: 'targetBelow',
  toleranceabove: 'toleranceAbove',
  tolerancebelow: 'toleranceBelow',
};

/**
 * An instant from a sheet: ISO 8601 with a zone ("2026-10-21T00:00:00Z", "...+02:00"), or without one ("2026-10-21 08:30[:00]",
 * "2026-10-21") which is read as UTC - the sheet's dates are UTC, like the API's. null for anything else.
 */
export function parseInstant(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(text)) iso = text.replace(' ', 'T');
  else if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) iso = text.replace(' ', 'T') + 'Z';
  else if (/^\d{4}-\d{2}-\d{2}$/.test(text)) iso = text + 'T00:00:00Z';
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

const SEARCH = (sensors: readonly SheetSensor[]) => new Map(sensors.map((s) => [s.externalSensorId.toLowerCase(), s]));

/**
 * Reads and validates the sheet against the Device's Sensors. Everything is checked before anything is sent: an unknown Sensor name,
 * a bad date or number, a target/tolerance on the wrong side for the Sensor's direction, a validTo before validFrom, two rows with
 * the same validFrom, intervals of one Sensor that overlap. `nowMs` is the moment of the import (used for a Sensor's single row that
 * has no validFrom).
 */
export function parseSetpointSheet(text: string, sensors: readonly SheetSensor[], nowMs: number): SetpointSheetResult {
  const result: SetpointSheetResult = { entries: [], issues: [], fileErrors: [], ignoredColumns: [], rowCount: 0 };
  const trimmed = text.startsWith(BOM) ? text.slice(1) : text;
  if (trimmed.trim() === '') return result;

  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? '';
  const table = splitDelimited(trimmed, detectDelimiter(firstLine));
  const header = table[0] ?? [];

  const index = new Map<SheetColumn, number>();
  header.forEach((cell, i) => {
    const key = normalizeHeader(cell);
    if (key === '') return;
    const column = COLUMN_ALIASES[key];
    if (column && !index.has(column)) index.set(column, i);
    else result.ignoredColumns.push(cell.trim());
  });

  if (!index.has('sensorName')) {
    result.fileErrors.push('The first row must be a header that contains a "sensorName" column (the Sensor externalSensorId).');
    return result;
  }
  // A sheet without any setpoint column would read every Sensor as "no setpoints" and delete them all - refuse it.
  if (!index.has('validFrom') || !SETPOINT_COLUMNS.some((c) => index.has(c))) {
    result.fileErrors.push('The sheet needs the "validFrom" column and at least one target/tolerance column - without them every listed Sensor would lose all its setpoints.');
    return result;
  }

  const rows = table.slice(1).map((cells, i) => ({ cells, line: i + 2 })).filter((r) => !r.cells.every((c) => c.trim() === ''));
  result.rowCount = rows.length;
  if (rows.length > MAX_SETPOINT_ROWS) {
    result.fileErrors.push(`The sheet has ${rows.length} rows; at most ${MAX_SETPOINT_ROWS} are imported at once.`);
    return result;
  }

  const bySensorName = SEARCH(sensors);
  const cellOf = (cells: string[], column: SheetColumn) => {
    const i = index.get(column);
    return i === undefined ? '' : (cells[i] ?? '').trim();
  };

  interface Candidate {
    line: number;
    fromRaw: string;
    from: number | null;
    to: number | null;
    values: SetpointValues;
  }
  const entriesById = new Map<number, { sensor: SheetSensor; candidates: Candidate[] }>();

  for (const { cells, line } of rows) {
    const name = cellOf(cells, 'sensorName');
    const fail = (field: string, value: string, message: string) => result.issues.push({ line, field, value, message });
    if (name === '') {
      fail('sensorName', '', 'sensorName is empty.');
      continue;
    }
    const sensor = bySensorName.get(name.toLowerCase());
    if (!sensor) {
      fail('sensorName', name, `"${name}" is not a Sensor of this Device.`);
      continue;
    }
    const entry = entriesById.get(sensor.id) ?? { sensor, candidates: [] };
    entriesById.set(sensor.id, entry);

    const fromRaw = cellOf(cells, 'validFrom');
    const toRaw = cellOf(cells, 'validTo');
    const before = result.issues.length;
    const values = readSetpoint((column) => cellOf(cells, column), sensor.direction, fail, true);

    // An empty row (only the name) is the "this Sensor has no setpoints" marker: it contributes no interval.
    if (fromRaw === '' && toRaw === '' && values === undefined) continue;

    if (values === undefined) {
      fail('target', '', 'A setpoint row needs a target (clear the whole row to remove this setpoint).');
      continue;
    }
    const from = fromRaw === '' ? null : parseInstant(fromRaw);
    if (fromRaw !== '' && from === null) fail('validFrom', fromRaw, `validFrom "${fromRaw}" must be a UTC date and time, e.g. 2026-10-21T08:00:00Z or 2026-10-21 08:00.`);
    const to = toRaw === '' ? null : parseInstant(toRaw);
    if (toRaw !== '' && to === null) fail('validTo', toRaw, `validTo "${toRaw}" must be a UTC date and time, e.g. 2026-10-21T08:00:00Z, or empty for an open-ended setpoint.`);
    if (result.issues.length > before) continue; // this row has problems already; do not build an interval out of it
    entry.candidates.push({ line, fromRaw, from, to, values });
  }

  for (const { sensor, candidates } of entriesById.values()) {
    const desired: DesiredInterval[] = [];
    for (const c of candidates) {
      let validFromMs = c.from;
      let defaulted = false;
      if (validFromMs === null) {
        if (candidates.length === 1) {
          validFromMs = nowMs;
          defaulted = true;
        } else {
          result.issues.push({ line: c.line, field: 'validFrom', value: '', message: `validFrom is empty; it may only be left empty when ${sensor.externalSensorId} has just this one row.` });
          continue;
        }
      }
      if (c.to !== null && c.to <= validFromMs) {
        result.issues.push({ line: c.line, field: 'validTo', value: String(c.to), message: 'validTo must be later than validFrom.' });
        continue;
      }
      desired.push({ line: c.line, validFromMs, validToMs: c.to, values: c.values, validFromDefaulted: defaulted });
    }

    desired.sort((a, b) => a.validFromMs - b.validFromMs);
    const clean: DesiredInterval[] = [];
    for (const d of desired) {
      const previous = clean[clean.length - 1];
      if (previous && previous.validFromMs === d.validFromMs) {
        result.issues.push({ line: d.line, field: 'validFrom', value: formatInstant(d.validFromMs), message: `${sensor.externalSensorId} has two rows with the same validFrom (line ${previous.line}).` });
        continue;
      }
      if (previous && (previous.validToMs === null || previous.validToMs > d.validFromMs)) {
        result.issues.push({
          line: d.line,
          field: 'validFrom',
          value: formatInstant(d.validFromMs),
          message: `Overlaps the interval of line ${previous.line} (${previous.validToMs === null ? 'it is open-ended - give it a validTo' : `it ends ${formatInstant(previous.validToMs)}`}).`,
        });
        continue;
      }
      clean.push(d);
    }
    result.entries.push({ sensor, desired: clean });
  }

  result.entries.sort((a, b) => a.sensor.id - b.sensor.id);
  return result;
}

// ---- import: the plan -------------------------------------------------------------------------------------------------------------

export interface SensorSyncPlan {
  sensor: SheetSensor;
  unchanged: ExistingInterval[];
  /** Stored intervals to delete. `replaced`: the same validFrom is created again with the sheet's values. */
  remove: { interval: ExistingInterval; replaced: boolean }[];
  /** Intervals to create, in chronological order. `replacement`: it takes the place of a deleted interval with the same validFrom. */
  create: { interval: DesiredInterval; replacement: boolean }[];
}

function sameValue(a: number | null | undefined, b: number | undefined): boolean {
  return (a ?? undefined) === b;
}

function sameInterval(existing: ExistingInterval, desired: DesiredInterval): boolean {
  if ((instantMs(existing.validTo) ?? null) !== desired.validToMs) return false;
  return SETPOINT_COLUMNS.every((column) => sameValue(existing[column], desired.values[column]));
}

/**
 * What the sheet means for the stored intervals, per Sensor of the sheet (Sensors not in the sheet get no plan - they are not
 * touched). Intervals are matched by validFrom: same validFrom and same validTo and values = unchanged; same validFrom but
 * different = replaced (deleted and created again - an interval's values are never edited in place); stored but not in the sheet
 * = deleted; in the sheet but not stored = created.
 */
export function planSetpointSync(entries: readonly SheetSensorEntry[], existing: readonly ExistingInterval[]): SensorSyncPlan[] {
  return entries.map(({ sensor, desired }) => {
    const stored = existing.filter((e) => e.sensorId === sensor.id).sort((a, b) => (instantMs(a.validFrom) ?? 0) - (instantMs(b.validFrom) ?? 0));
    const storedByFrom = new Map(stored.map((e) => [instantMs(e.validFrom), e]));
    const matched = new Set<ExistingInterval>();
    const plan: SensorSyncPlan = { sensor, unchanged: [], remove: [], create: [] };

    for (const d of desired) {
      const e = storedByFrom.get(d.validFromMs);
      if (e === undefined) {
        plan.create.push({ interval: d, replacement: false });
      } else {
        matched.add(e);
        if (sameInterval(e, d)) plan.unchanged.push(e);
        else {
          plan.remove.push({ interval: e, replaced: true });
          plan.create.push({ interval: d, replacement: true });
        }
      }
    }
    for (const e of stored) if (!matched.has(e)) plan.remove.push({ interval: e, replaced: false });
    return plan;
  });
}

export interface PlanSummary {
  sensorsInSheet: number;
  sensorsChanged: number;
  created: number;
  replaced: number;
  deleted: number;
  unchanged: number;
}

export function summarizePlan(plans: readonly SensorSyncPlan[]): PlanSummary {
  const summary: PlanSummary = { sensorsInSheet: plans.length, sensorsChanged: 0, created: 0, replaced: 0, deleted: 0, unchanged: 0 };
  for (const plan of plans) {
    const created = plan.create.filter((c) => !c.replacement).length;
    const replaced = plan.create.filter((c) => c.replacement).length;
    const deleted = plan.remove.filter((r) => !r.replaced).length;
    summary.created += created;
    summary.replaced += replaced;
    summary.deleted += deleted;
    summary.unchanged += plan.unchanged.length;
    if (created + replaced + deleted > 0) summary.sensorsChanged += 1;
  }
  return summary;
}

/** The values of an interval as text: "target 5 ± 1" / "above 5 ± 1, below 3 ± 1". */
export function describeValues(values: Partial<Record<SetpointColumn, number | null | undefined>>): string {
  const side = (label: string, target: number | null | undefined, tolerance: number | null | undefined) =>
    target == null ? [] : [`${label} ${target}${tolerance == null ? '' : ` ± ${tolerance}`}`];
  return [...side('target', values.target, values.tolerance), ...side('above', values.targetAbove, values.toleranceAbove), ...side('below', values.targetBelow, values.toleranceBelow)].join(', ');
}
