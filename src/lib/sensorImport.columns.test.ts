import { describe, it, expect } from 'vitest';
import { parseSensorTable, type ImportDefaults } from './sensorImport';
import { CATALOG } from '@/test/sensorCatalog';

const DEFAULTS: ImportDefaults = { direction: 'lowerisbetter', rawScale: 'Seconds', rawLookback: '60', rawMinIssueScore: '1', processingEnabled: true };

describe('import column names', () => {
  it('the template headers sensorName, displayName and sensorType fill the Sensor id, name and sensor type', () => {
    const { rows, ignoredColumns } = parseSensorTable('sensorName,displayName,sensorType\ntemp_1,Bearing,temperature', DEFAULTS, CATALOG);
    expect(ignoredColumns).toEqual([]);
    expect(rows[0]).toMatchObject({ externalSensorId: 'temp_1', name: 'Bearing', sensorType: 'temperature' });
  });

  it('the former headers still work as aliases', () => {
    for (const header of ['externalSensorId,name,quantityKind', 'machineName,displayName,quantity', 'sensorid,name,QuantityKind']) {
      const { rows, ignoredColumns } = parseSensorTable(`${header}\ntemp_1,Bearing,temperature`, DEFAULTS, CATALOG);
      expect(ignoredColumns, header).toEqual([]);
      expect(rows[0], header).toMatchObject({ externalSensorId: 'temp_1', name: 'Bearing', sensorType: 'temperature' });
    }
  });

  it('a too long sensorType is reported under the header the user sees', () => {
    const { rows } = parseSensorTable(`sensorName,sensorType\ntemp_1,${'x'.repeat(101)}`, DEFAULTS, CATALOG);
    expect(rows[0]!.issues[0]!.message).toMatch(/^sensorType is longer than 100/);
  });
});
