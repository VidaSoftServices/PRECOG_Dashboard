import { describe, it, expect } from 'vitest';
import { findSameSensor } from './sensorLink';

const list = [
  { id: 1, name: '1# Velocity RMS Y', externalSensorId: 'velocity_rms_y_eq_1' },
  { id: 2, name: '1# Velocity RMS Z', externalSensorId: 'velocity_rms_z_eq_1' },
  { id: 3, name: 'Shaft speed', externalSensorId: 'shaft_rpm_mean_1' },
];

describe('findSameSensor', () => {
  it('matches by the external Sensor id first, ignoring case and blanks', () => {
    expect(findSameSensor(list, { id: 11, name: 'other name', externalSensorId: ' VELOCITY_RMS_Z_EQ_1 ' })?.id).toBe(2);
  });

  it('falls back to the display name when no id matches', () => {
    expect(findSameSensor(list, { id: 11, name: 'shaft SPEED', externalSensorId: 'rpm' })?.id).toBe(3);
  });

  it('is undefined when the other Device has no such indicator, or nothing is chosen', () => {
    expect(findSameSensor(list, { id: 11, name: 'Temperature', externalSensorId: 'temp_1' })).toBeUndefined();
    expect(findSameSensor(list, undefined)).toBeUndefined();
    expect(findSameSensor([], { id: 1, name: 'x', externalSensorId: 'x' })).toBeUndefined();
  });

  it('does not treat a missing id or name as equal to another missing one', () => {
    expect(findSameSensor([{ id: 1, name: null, externalSensorId: null }], { id: 2, name: null, externalSensorId: null })).toBeUndefined();
  });
});
