import { describe, it, expect } from 'vitest';
import { filterSensorTypes } from './sensorTypes';

const TYPES = ['humidity', 'pressure', 'temperature', 'vibration'];

describe('filterSensorTypes', () => {
  it('offers the whole list when nothing is typed', () => {
    expect(filterSensorTypes(TYPES, '')).toEqual(TYPES);
    expect(filterSensorTypes(TYPES, '   ')).toEqual(TYPES);
  });

  it('narrows to the types containing the typed text, ignoring case', () => {
    expect(filterSensorTypes(TYPES, 'PRE')).toEqual(['pressure']);
    expect(filterSensorTypes(TYPES, 'ur')).toEqual(['pressure', 'temperature']);
    expect(filterSensorTypes(TYPES, 'vib')).toEqual(['vibration']);
  });

  it('offers the whole list again when the value already is one of the types, so another can be picked', () => {
    expect(filterSensorTypes(TYPES, 'vibration')).toEqual(TYPES);
    expect(filterSensorTypes(TYPES, 'Vibration')).toEqual(TYPES);
    expect(filterSensorTypes(TYPES, ' vibration ')).toEqual(TYPES);
  });

  it('gives nothing for a new type - the typed text simply is a new value', () => {
    expect(filterSensorTypes(TYPES, 'flow rate')).toEqual([]);
  });

  it('handles an empty list and never changes the input', () => {
    expect(filterSensorTypes([], 'x')).toEqual([]);
    const copy = [...TYPES];
    filterSensorTypes(copy, 'ur');
    expect(copy).toEqual(TYPES);
  });
});
