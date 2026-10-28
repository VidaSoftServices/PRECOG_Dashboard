import { SCALES, SETPOINT_COLUMNS, TEMPLATE_HEADERS, csvField, type SetpointColumn } from '@/lib/sensorImport';
import { isRawPolicy } from '@/lib/policies';

/** The columns of the Sensor export - exactly the template's columns (see TEMPLATE_HEADERS), in the same order, "(optional)" included. */
export const SENSOR_EXPORT_HEADERS = TEMPLATE_HEADERS;

export interface ExportSensor {
  id?: number | null;
  externalSensorId?: string | null;
  name?: string | null;
  direction?: string | null;
  sensorType?: string | null;
  unitCode?: string | null;
  processingEnabled?: boolean | null;
}

export interface ExportPolicy {
  sensorId?: number | null;
  timeScale?: string | null;
  aggregationFunction?: string | null;
  scale?: string | null;
  lookback?: number | null;
  minIssueScore?: number | null;
}

/** A stored Setpoint interval, as the Device-wide listing returns it. */
export interface ExportSetpoint {
  sensorId?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  target?: number | null;
  tolerance?: number | null;
  targetAbove?: number | null;
  targetBelow?: number | null;
  toleranceAbove?: number | null;
  toleranceBelow?: number | null;
}

const BOM = String.fromCharCode(0xfeff);

/** The setpoint columns that belong to a Sensor's direction - the importer refuses the other side's. */
function columnsFor(direction: string | null | undefined): readonly SetpointColumn[] {
  return direction === 'bidirectional' ? ['targetAbove', 'targetBelow', 'toleranceAbove', 'toleranceBelow'] : ['target', 'tolerance'];
}

/**
 * The Setpoint interval in effect at `now` for each Sensor: it started (validFrom <= now) and has not ended (no validTo, or a later
 * one); if several qualify, the one that started last. A Sensor whose intervals are all past or all in the future has none -
 * exporting such a value as "the current setpoint" would make a re-import create an interval that is not there today.
 */
function effectiveBySensor(setpoints: readonly ExportSetpoint[], now: number): Map<number, ExportSetpoint> {
  const effective = new Map<number, { setpoint: ExportSetpoint; from: number }>();
  for (const sp of setpoints) {
    if (sp.sensorId == null || !sp.validFrom) continue;
    const from = Date.parse(sp.validFrom);
    const to = sp.validTo ? Date.parse(sp.validTo) : null;
    if (Number.isNaN(from) || from > now || (to !== null && (Number.isNaN(to) || to <= now))) continue;
    const current = effective.get(sp.sensorId);
    if (!current || from > current.from) effective.set(sp.sensorId, { setpoint: sp, from });
  }
  return new Map([...effective].map(([id, { setpoint }]) => [id, setpoint]));
}

/** The API sends the scale in lower case ("days"); the sheet and the import use the canonical spelling ("Days"). */
function canonicalScale(scale: string | null | undefined): string {
  if (!scale) return '';
  return SCALES.find((s) => s.toLowerCase() === scale.toLowerCase()) ?? scale;
}

/**
 * Every Sensor of a Device as a sheet the Sensor import can take back as it is: one row per Sensor, the id in `sensorName`, its
 * display name, direction, type, unit, the raw/base policy's scale / lookback / minimum issue score and the Calculate switch.
 * The last six columns carry the Sensor's CURRENT setpoint (the interval in effect now: target / tolerance, or the four above/below
 * columns for a bidirectional Sensor; empty for a Sensor with none). Importing the sheet again changes nothing: every value already
 * matches, and an unchanged setpoint writes nothing. The full history of every interval is the "Manage Setpoints" export. A Sensor
 * without a raw policy leaves those three cells empty (the import then leaves them alone).
 */
export function buildSensorsExportCsv(
  sensors: readonly ExportSensor[],
  policies: readonly ExportPolicy[],
  setpoints: readonly ExportSetpoint[] = [],
  now: Date = new Date(),
): string {
  const currentSetpoint = effectiveBySensor(setpoints, now.getTime());
  const rawBySensor = new Map<number, ExportPolicy>();
  for (const policy of policies) {
    if (policy.sensorId != null && isRawPolicy(policy)) rawBySensor.set(policy.sensorId, policy);
  }

  const rows = [...sensors]
    .filter((s): s is ExportSensor & { externalSensorId: string } => !!s.externalSensorId)
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .map((sensor) => {
      const raw = sensor.id != null ? rawBySensor.get(sensor.id) : undefined;
      const current = sensor.id != null ? currentSetpoint.get(sensor.id) : undefined;
      const own = columnsFor(sensor.direction);
      return [
        sensor.externalSensorId,
        sensor.name ?? '',
        sensor.direction ?? '',
        sensor.sensorType ?? '',
        sensor.unitCode ?? '',
        canonicalScale(raw?.scale),
        raw?.lookback ?? '',
        raw?.minIssueScore ?? '',
        sensor.processingEnabled === false ? 'FALSE' : 'TRUE',
        ...SETPOINT_COLUMNS.map((column) => (current && own.includes(column) ? (current[column] ?? '') : '')),
      ]
        .map(csvField)
        .join(',');
    });

  return BOM + [SENSOR_EXPORT_HEADERS.join(','), ...rows].join('\r\n') + '\r\n';
}

export function sensorsExportFileName(deviceId: number): string {
  return `sensors-device-${deviceId}.csv`;
}
