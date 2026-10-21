/** The two names a Sensor can be found by on screen. */
interface NamedSensor {
  name?: string | null;
  externalSensorId?: string | null;
}

/**
 * Sensors whose name or externalSensorId contains the text (case-insensitive, surrounding blanks ignored). An empty filter
 * keeps every Sensor, in the original order. Shared by every page that lists a Device's Sensors for picking or watching.
 */
export function filterSensors<T extends NamedSensor>(sensors: readonly T[], text: string): T[] {
  const needle = text.trim().toLowerCase();
  if (needle === '') return [...sensors];
  return sensors.filter((s) => (s.name ?? '').toLowerCase().includes(needle) || (s.externalSensorId ?? '').toLowerCase().includes(needle));
}
