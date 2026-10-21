import { describe, it, expect } from 'vitest';
import { buildTemplateCsv, findKnownMetric, parseSensorTable, toImportCatalog, TEMPLATE_HEADERS, type ImportDefaults } from './sensorImport';
import { CATALOG, CATALOG_DTO } from '@/test/sensorCatalog';

const DEFAULTS: ImportDefaults = { direction: 'lowerisbetter', rawScale: 'Seconds', rawLookback: '60', rawMinIssueScore: '1', processingEnabled: true };

const HEADER = 'machineName,displayName,unitCode';

function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** One sheet line for a catalog metric, optionally with an overridden unit. */
function line(machineName: string, overrides: { unitCode?: string } = {}, point = 1): string {
  const m = CATALOG.metrics.find((x) => x.machineName === machineName)!;
  return [`${machineName}_${point}`, m.displayName, overrides.unitCode ?? m.unitCode].map(csvField).join(',');
}

function parse(...lines: string[]) {
  return parseSensorTable([HEADER, ...lines].join('\n'), DEFAULTS, CATALOG);
}

describe('the test catalog is the full API catalog', () => {
  it('has the 7 units and the 163 metrics - and no aggregation data at all', () => {
    expect(CATALOG.units.map((u) => u.code)).toEqual(['g', 'mm_s', 'mm', 'one', 'raw_energy', 'degC', 'rpm']);
    expect(CATALOG.metrics).toHaveLength(163);
    expect(new Set(CATALOG.metrics.map((m) => m.machineName)).size).toBe(163);
    expect(JSON.stringify(CATALOG_DTO)).not.toMatch(/aggregation/i);
  });

  it('toImportCatalog refuses an incomplete response instead of guessing', () => {
    expect(toImportCatalog(undefined)).toBeUndefined();
    expect(toImportCatalog({ units: [] })).toBeUndefined();
  });
});

describe('valid unit import', () => {
  it('accepts every known metric of both measurement points with its own unit', () => {
    for (const point of [1, 2]) {
      const { rows, fileErrors } = parse(...CATALOG.metrics.map((m) => line(m.machineName, {}, point)));
      expect(fileErrors).toEqual([]);
      expect(rows).toHaveLength(163);
      expect(rows.flatMap((r) => r.errors)).toEqual([]);
      // Row n carries exactly the catalog entry n - nothing was corrected on the way.
      rows.forEach((r, i) => {
        const m = CATALOG.metrics[i]!;
        expect(r.unitCode).toBe(m.unitCode);
        expect(r.knownMetric).toBe(m.machineName);
      });
    }
  });

  it('understands machineName / displayName as the Sensor id and name', () => {
    const { rows } = parse(line('shaft_rpm_mean'));
    expect(rows[0]).toMatchObject({ externalSensorId: 'shaft_rpm_mean_1', name: CATALOG.metrics.find((m) => m.machineName === 'shaft_rpm_mean')!.displayName });
  });

  it('keeps raw_energy as raw_energy - never g, g^2 or g^2/Hz', () => {
    const { rows } = parse(line('energy_1x_x_mean'), line('band_1_2x_total_max'), line('spectrum_energy_y_mean'));
    expect(rows.map((r) => r.unitCode)).toEqual(['raw_energy', 'raw_energy', 'raw_energy']);
    expect(rows.flatMap((r) => r.errors)).toEqual([]);
  });

  it('lets an ordinary Sensor (not a known metric) be imported with any free-text unit, or none', () => {
    const { rows } = parseSensorTable('externalSensorId,unitCode\nmy_pressure,bar\nmy_other,', DEFAULTS, CATALOG);
    expect(rows[0]).toMatchObject({ unitCode: 'bar', errors: [] });
    expect(rows[1]).toMatchObject({ unitCode: '', errors: [] });
  });

  it('has no aggregation columns: an old sheet that still has them gets them reported as ignored, and nothing is sent', () => {
    const { rows, ignoredColumns } = parseSensorTable(
      'machineName,unitCode,aggregationType,aggregationExplanation\nvelocity_rms_x_eq_1,mm_s,EQUIVALENT_RMS,some text',
      DEFAULTS,
      CATALOG,
    );
    expect(ignoredColumns).toEqual(['aggregationType', 'aggregationExplanation']);
    expect(rows[0]!.errors).toEqual([]);
    expect(Object.keys(rows[0]!)).not.toContain('aggregationType');
    expect(Object.keys(rows[0]!)).not.toContain('aggregationExplanation');
  });

  it('refuses to validate anything while the catalog is not available', () => {
    const result = parseSensorTable(`${HEADER}\n${line('shaft_rpm_mean')}`, DEFAULTS, undefined);
    expect(result.rows).toEqual([]);
    expect(result.fileErrors[0]).toMatch(/catalog has not been loaded/);
  });
});

describe('invalid unit of a known metric is rejected - with the row and the field', () => {
  it('missing unitCode', () => {
    const { rows } = parse(line('velocity_rms_x_eq', { unitCode: '' }));
    expect(rows[0]!.issues).toEqual([expect.objectContaining({ field: 'unitCode', value: '' })]);
    expect(rows[0]!.line).toBe(2);
    expect(rows[0]!.issues[0]!.message).toMatch(/required/);
  });

  it.each(['g2', 'g²', 'g2/Hz', 'mm/s', 'MM_S', 'Cel'])('unknown unitCode "%s" is rejected, never corrected', (unit) => {
    const { rows } = parse(line('velocity_rms_x_eq', { unitCode: unit }));
    const issue = rows[0]!.issues.find((i) => i.field === 'unitCode')!;
    expect(issue.value).toBe(unit);
    expect(issue.message).toMatch(/Unknown unitCode/);
    // The offending value is still what the row carries - nothing was rewritten.
    expect(rows[0]!.unitCode).toBe(unit);
  });

  it('an energy metric given the unit g (or no unit) is rejected - a missing energy unit is not guessed', () => {
    const asG = parse(line('band_1_2x_x_mean', { unitCode: 'g' }));
    expect(asG.rows[0]!.issues.find((i) => i.field === 'unitCode')!.message).toMatch(/raw_energy/);

    const missing = parse(line('energy_1x_x_mean', { unitCode: '' }));
    expect(missing.rows[0]!.issues.map((i) => i.field)).toContain('unitCode');
    expect(missing.rows[0]!.unitCode).toBe('');
  });

  it('a known metric with a valid but wrong unit is rejected', () => {
    const wrongUnit = parse(line('velocity_rms_x_eq', { unitCode: 'g' }));
    expect(wrongUnit.rows[0]!.issues.find((i) => i.field === 'unitCode')!.message).toMatch(/whose unitCode is 'mm_s'/);
  });

  it('a duplicate machine name is rejected on the second row', () => {
    const { rows } = parse(line('shaft_rpm_mean'), line('shaft_rpm_mean'));
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[1]!.issues).toEqual([expect.objectContaining({ field: 'externalSensorId', message: expect.stringContaining('repeated (first on line 2)') })]);
  });
});

describe('known-metric matching', () => {
  it('is exact: a point suffix is required, and no prefix or case-insensitive match exists', () => {
    expect(findKnownMetric(CATALOG, 'velocity_rms_x_eq_1')?.machineName).toBe('velocity_rms_x_eq');
    expect(findKnownMetric(CATALOG, 'velocity_rms_x_eq')).toBeUndefined();
    expect(findKnownMetric(CATALOG, 'VELOCITY_RMS_X_EQ_1')).toBeUndefined();
    expect(findKnownMetric(CATALOG, 'velocity_rms_x_1')).toBeUndefined();
    expect(findKnownMetric(CATALOG, 'velocity_rms_x_eq_0')).toBeUndefined();
  });
});

describe('template and round trip', () => {
  it('the template lists the unit column - and no aggregation columns - and its example rows are valid and equal to the catalog', () => {
    const csv = buildTemplateCsv(CATALOG);
    const header = csv.replace(/^\uFEFF/, '').split('\r\n')[0]!.split(',');
    for (const column of ['sensorName', 'displayName', 'unitCode']) expect(header).toContain(column);
    expect(header.join(',')).not.toMatch(/aggregation/i);
    expect(header).toEqual([...TEMPLATE_HEADERS]);

    const { rows, fileErrors, ignoredColumns } = parseSensorTable(csv, { ...DEFAULTS, rawScale: '', rawLookback: '' }, CATALOG);
    expect(fileErrors).toEqual([]);
    expect(ignoredColumns).toEqual([]);
    // One example per distinct unit of the catalog.
    expect(rows).toHaveLength(CATALOG.units.length);
    expect(rows.flatMap((r) => r.errors)).toEqual([]);
    for (const r of rows) {
      const m = findKnownMetric(CATALOG, r.externalSensorId)!;
      expect(m).toBeDefined();
      expect(r.unitCode).toBe(m.unitCode);
    }
  });

  it('a catalog -> CSV -> import round trip keeps the unit exactly, for all 163 metrics', () => {
    const csv = [HEADER, ...CATALOG.metrics.map((m) => line(m.machineName))].join('\r\n');
    const { rows } = parseSensorTable(csv, DEFAULTS, CATALOG);
    expect(rows.map((r) => r.unitCode)).toEqual(CATALOG.metrics.map((m) => m.unitCode));
  });

  it('also survives a semicolon-separated re-save', () => {
    const rows163 = CATALOG.metrics.map((m) => [`${m.machineName}_1`, m.displayName, m.unitCode].map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';'));
    const { rows } = parseSensorTable(['machineName;displayName;unitCode', ...rows163].join('\n'), DEFAULTS, CATALOG);
    expect(rows.flatMap((r) => r.errors)).toEqual([]);
    expect(rows.map((r) => r.unitCode)).toEqual(CATALOG.metrics.map((m) => m.unitCode));
  });
});

describe('what the catalog says about the Vibration_Duo families (from the API, not from the dashboard)', () => {
  const by = (prefix: string) => CATALOG.metrics.filter((m) => m.machineName.startsWith(prefix));
  const labelOf = (code: string) => CATALOG.units.find((u) => u.code === code)!.label;

  it('shows the canonical unit labels', () => {
    expect(labelOf(by('velocity_rms_')[0]!.unitCode)).toBe('mm/s');
    expect(labelOf(by('acceleration_rms_')[0]!.unitCode)).toBe('g');
    expect(labelOf(by('energy_')[0]!.unitCode)).toBe('Relative spectrum energy');
    expect(labelOf(by('sensor_temperature_')[0]!.unitCode)).toBe('°C');
    expect(labelOf(by('shaft_rpm_')[0]!.unitCode)).toBe('RPM');
  });

  it('shows no g for a dimensionless metric: the general dimension is "Unit"', () => {
    for (const prefix of ['acceleration_kurtosis_', 'crest_factor_']) {
      for (const m of by(prefix)) {
        expect(m.unitCode).toBe('one');
        expect(labelOf(m.unitCode)).toBe('Unit');
        expect(labelOf(m.unitCode)).not.toBe('g');
      }
    }
  });

  it('the DTO fixture is the same data the importer sees', () => {
    expect(CATALOG_DTO.metrics).toHaveLength(CATALOG.metrics.length);
  });
});
