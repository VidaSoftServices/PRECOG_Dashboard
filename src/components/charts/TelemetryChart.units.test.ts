import { describe, it, expect } from 'vitest';
import { sharedUnitLabel, unitLabelOfDataset, type TelemetrySeriesInput } from './TelemetryChart';

const series = (label: string, unitLabel?: string | null): TelemetrySeriesInput => ({ label, points: [], unitLabel });

describe('chart unit labels come from the series (the API), never from a name', () => {
  it('the axis title is the unit label shared by every series', () => {
    expect(sharedUnitLabel([series('A', 'mm/s')])).toBe('mm/s');
    expect(sharedUnitLabel([series('A', 'mm/s'), series('B', 'mm/s')])).toBe('mm/s');
    expect(sharedUnitLabel([series('A', 'Relative spectrum energy')])).toBe('Relative spectrum energy');
    expect(sharedUnitLabel([series('A', '°C')])).toBe('°C');
    expect(sharedUnitLabel([series('A', 'RPM')])).toBe('RPM');
    expect(sharedUnitLabel([series('A', 'Unit')])).toBe('Unit');
  });

  it('there is no axis title when the series have different units - two units are never merged under one axis', () => {
    expect(sharedUnitLabel([series('A', 'g'), series('B', 'mm/s')])).toBeUndefined();
  });

  it('there is no axis title when a series has no unit, and a unit is never invented for it', () => {
    expect(sharedUnitLabel([series('A', null)])).toBeUndefined();
    expect(sharedUnitLabel([series('A', 'g'), series('B')])).toBeUndefined();
    expect(sharedUnitLabel([])).toBeUndefined();
  });

  it('a metric named like an RMS metric gets no unit unless the API supplied one', () => {
    // The label is "velocity_rms_x_eq" - a name-based guess would say mm/s; nothing may do that.
    expect(sharedUnitLabel([series('velocity_rms_x_eq')])).toBeUndefined();
  });

  it('a derived dataset (limit, target) takes the unit of the series it belongs to', () => {
    const all = [series('Vibration', 'mm/s'), series('Temperature', '°C')];
    expect(unitLabelOfDataset(all, 'Vibration')).toBe('mm/s');
    expect(unitLabelOfDataset(all, 'Vibration UCL3')).toBe('mm/s');
    expect(unitLabelOfDataset(all, 'Temperature Target')).toBe('°C');
    expect(unitLabelOfDataset(all, 'Something else')).toBeUndefined();
    expect(unitLabelOfDataset(all, undefined)).toBeUndefined();
  });
});
