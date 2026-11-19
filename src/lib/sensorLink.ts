/** The part of a Sensor the link rule needs. */
export interface LinkableSensor {
  id?: number | null;
  name?: string | null;
  externalSensorId?: string | null;
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The Sensor of another Device that is "the same indicator": the same external Sensor id (the firmware's tag, for example
 * `some_sensor_tag_1`), or - when no id matches - the same display name. Case and blanks around the text are ignored.
 * Used by Compare Devices: with the two Sensor lists linked, choosing a Sensor on one side chooses its counterpart on the other. Undefined when
 * the other Device has no such Sensor.
 */
export function findSameSensor<T extends LinkableSensor>(candidates: readonly T[], sensor: LinkableSensor | undefined): T | undefined {
  if (!sensor) return undefined;
  return (
    candidates.find((c) => same(c.externalSensorId, sensor.externalSensorId)) ??
    candidates.find((c) => same(c.name, sensor.name))
  );
}
