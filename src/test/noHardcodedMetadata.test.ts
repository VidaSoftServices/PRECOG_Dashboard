import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The unit and future-aggregation metadata of a metric comes from the API (GET /api/SensorMetadata). This guard fails
 * if application code starts carrying its own mapping: no source file other than the generated API schema (and tests /
 * fixtures) may contain a unit code or aggregation type as a string literal, and none may map a metric name to a unit.
 */
const src = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'schema.generated.ts' ? [path] : [];
  });
}

describe('no hard-coded unit or aggregation mapping in the dashboard', () => {
  const files = sourceFiles(src);

  it('scans the real application sources', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('contains no unit code or aggregation type as a string literal', () => {
    const literal = /['"`](mm_s|raw_energy|degC|rpm|one|EQUIVALENT_RMS|WEIGHTED_MEAN|MAXIMUM)['"`]/;
    const offenders = files.filter((f) => literal.test(readFileSync(f, 'utf-8'))).map((f) => relative(src, f));
    expect(offenders).toEqual([]);
  });

  it('does not map a metric name to a unit or an aggregation anywhere', () => {
    // A family prefix next to a unit / aggregation literal would be the signature of such a mapping.
    const familyNames = /(acceleration_rms|velocity_rms|displacement_rms|kurtosis|crest_factor|spectrum_energy|sensor_temperature|shaft_rpm)/;
    const offenders = files.filter((f) => familyNames.test(readFileSync(f, 'utf-8'))).map((f) => relative(src, f));
    expect(offenders).toEqual([]);
  });
});
