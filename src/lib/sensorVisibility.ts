/**
 * The per-Sensor "visible" flag (`SensorDto.visible`, default true): a hidden Sensor is left out of the Live Monitoring cards and
 * rotation and out of the Smart Analytics Sensor pickers. It is a presentation flag only - the API's reads do not filter on it, the
 * Device page still lists every Sensor (that is where an Admin switches it back on), and Issue pages never filter on it, so an Issue
 * that involves a hidden Sensor still shows it. Only Live Monitoring and Smart Analytics call these helpers.
 */
export interface VisibilityFlag {
  visible?: boolean | null;
}

/** True unless the Sensor is explicitly hidden - a Sensor from an older API that has no flag at all counts as shown. */
export function isShownSensor(sensor: VisibilityFlag): boolean {
  return sensor.visible !== false;
}

/** The Sensors that are shown, and how many were hidden. */
export function splitShownSensors<T extends VisibilityFlag>(sensors: readonly T[] | undefined): { shown: T[]; hiddenCount: number } {
  const all = sensors ?? [];
  const shown = all.filter(isShownSensor);
  return { shown, hiddenCount: all.length - shown.length };
}
