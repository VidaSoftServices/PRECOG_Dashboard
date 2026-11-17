import type { SensorDto } from '@/api/hooks/sensors';

/**
 * Whether a Device-wide or single "Recalc" will take this Sensor: calculation on and not in maintenance mode. The API decides finally -
 * it also leaves out Sensors that are not continuous and unidirectional and lists them with the reason. A missing `processingEnabled`
 * (an older API) counts as on, like everywhere else in this app.
 */
export function isRecalculable(sensor: SensorDto): boolean {
  return sensor.processingEnabled !== false && !sensor.maintenanceMode;
}
