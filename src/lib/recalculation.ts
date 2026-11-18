import type { SensorDto } from '@/api/hooks/sensors';

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
