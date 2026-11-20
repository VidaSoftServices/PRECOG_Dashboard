import type { SensorDto } from '@/api/hooks/sensors';
import { detectDelimiter, normalizeHeader, splitDelimited } from '@/lib/sensorImport';

/**
 * Whether a Device-wide or single "Recalc" will take this Sensor: anything not in maintenance mode. The API decides finally - it also
 * leaves out Sensors that are not continuous and unidirectional and lists them with the reason.
 */
export function isRecalculable(sensor: SensorDto): boolean {
  return !sensor.maintenanceMode;
}

/**
 * Recalc on a Sensor whose calculation is switched off only DELETES (its calculated values and unreviewed Issues; nothing is calculated) -
 * for example to free the space of a Sensor that will not be calculated. Switching its calculation on later calculates everything. A missing
 * `processingEnabled` (an older API) counts as on, like everywhere else in this app.
 */
export function isDeleteOnly(sensor: SensorDto): boolean {
  return sensor.processingEnabled === false;
}

export interface SensorNameList {
  /** The listed Sensors' ids, in the order of the list, without duplicates. */
  ids: number[];
  /** Names that are not a Sensor of the Device. */
  unknown: string[];
  /** Names listed more than once (counted once). */
  duplicates: string[];
  /** Number of names read (blank lines and the header excluded). */
  count: number;
}

/**
 * Reads the list of Sensors a Recalc is limited to: a pasted column of Sensor names (one per line), or a whole CSV / Excel paste with a header
 * that has a `SensorName` column (any other columns are ignored, so a Sensor import sheet or an export can be pasted as it is). A name is the
 * Sensor's external id (`externalSensorId`, case insensitive) or its display name. Pure; the API decides finally (400 for an id that is not a
 * Sensor of the Device).
 */
export function parseSensorNameList(text: string, sensors: readonly SensorDto[]): SensorNameList {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  const result: SensorNameList = { ids: [], unknown: [], duplicates: [], count: 0 };
  if (trimmed === '') return result;

  const first = trimmed.split(/\r?\n/, 1)[0] ?? '';
  const table = splitDelimited(trimmed, detectDelimiter(first));
  const header = (table[0] ?? []).map((c) => normalizeHeader(c));
  const nameColumn = header.indexOf('sensorname');
  const rows = nameColumn >= 0 ? table.slice(1) : table;
  const column = nameColumn >= 0 ? nameColumn : 0;

  const byName = new Map<string, SensorDto>();
  for (const s of sensors) {
    if (s.externalSensorId) byName.set(s.externalSensorId.trim().toLowerCase(), s);
    if (s.name && !byName.has(s.name.trim().toLowerCase())) byName.set(s.name.trim().toLowerCase(), s);
  }
  const seen = new Set<number>();
  for (const row of rows) {
    const name = (row[column] ?? '').trim();
    if (name === '') continue;
    result.count++;
    const sensor = byName.get(name.toLowerCase());
    if (!sensor || sensor.id == null) {
      result.unknown.push(name);
    } else if (seen.has(sensor.id)) {
      result.duplicates.push(name);
    } else {
      seen.add(sensor.id);
      result.ids.push(sensor.id);
    }
  }
  return result;
}
