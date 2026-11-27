import { describe, it, expect } from 'vitest';
import { deviceFilePart } from './deviceFileName';
import { sensorsExportFileName } from './sensorExport';
import { setpointsExportFileName } from './setpointSheet';
import { aggregationExportFileName } from './aggregationSheet';
import { sensorMapFileName } from './sensorMap';

describe('deviceFilePart', () => {
  it('puts the Device name after the number, so the file says which Device it is', () => {
    // the Test_Device case: its Device ID is "1", its name is what the file must carry
    expect(aggregationExportFileName(1, 'Test_Device')).toBe('aggregation-device-1-Test_Device.csv');
    expect(deviceFilePart(2, 'KS4')).toBe('device-2-KS4');
    expect(sensorsExportFileName(2, 'KS4')).toBe('sensors-device-2-KS4.csv');
    expect(setpointsExportFileName(2, 'KS4')).toBe('setpoints-device-2-KS4.csv');
    expect(aggregationExportFileName(2, 'KS4')).toBe('aggregation-device-2-KS4.csv');
    expect(sensorMapFileName(2, 'KS4')).toBe('sensor_map-device-2-KS4.txt');
  });

  it('makes a name safe for a file name (accented letters stay), and falls back to the number alone', () => {
    expect(deviceFilePart(3, ' AHU1 / Budapest: T2 ')).toBe('device-3-AHU1_Budapest_T2');
    expect(deviceFilePart(3, 'Légkezelő #1')).toBe('device-3-Légkezelő_1');
    expect(deviceFilePart(3, 'Siemens pilot winding machine')).toBe('device-3-Siemens_pilot_winding_machine');
    expect(deviceFilePart(3, '...')).toBe('device-3');
    expect(deviceFilePart(3, null)).toBe('device-3');
    expect(deviceFilePart(3, undefined)).toBe('device-3');
    expect(deviceFilePart(3, 'x'.repeat(100))).toBe('device-3-' + 'x'.repeat(60));
  });
});
