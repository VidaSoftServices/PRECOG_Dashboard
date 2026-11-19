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

/**
 * Items whose WHOLE displayed text contains every word of the filter (case-insensitive, words in any order, blanks ignored): the filter of the Smart
 * Analytics lists searches the full label a row shows - the name, the direction, the aggregation level ("Vibration X . 1 day . Average") and the
 * "Calculation off" mark - not just the Sensor's name. `labelOf` returns everything that should be searchable for the item. An empty filter keeps every item.
 */
export function filterByLabel<T>(items: readonly T[], text: string, labelOf: (item: T) => string): T[] {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return [...items];
  return items.filter((item) => {
    const label = labelOf(item).toLowerCase();
    return words.every((w) => label.includes(w));
  });
}
