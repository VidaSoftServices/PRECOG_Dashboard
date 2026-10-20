import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { MetricDefinitionCard } from './MetricDefinitionCard';
import type { SensorDto } from '@/api/hooks/sensors';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';
import { CATALOG, CATALOG_DTO } from '@/test/sensorCatalog';

/** A SensorDto built from the API catalog entry, with the labels the server resolves - the way GET .../Sensors returns it. */
function sensorFor(machineName: string, overrides: Partial<SensorDto> = {}): SensorDto {
  const m = CATALOG.metrics.find((x) => x.machineName === machineName)!;
  const unit = CATALOG_DTO.units!.find((u) => u.code === m.unitCode)!;
  return {
    id: 5,
    deviceId: 1,
    externalSensorId: `${machineName}_1`,
    name: m.displayName,
    unitCode: m.unitCode,
    unitLabel: unit.label,
    unitLabelHu: unit.labelHu,
    aggregationType: m.aggregationType as SensorDto['aggregationType'],
    aggregationExplanation: m.aggregationExplanation,
    ...overrides,
  };
}

function renderCard(sensor: SensorDto) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  fetchMock().mockImplementation(
    async () => new Response(JSON.stringify(CATALOG_DTO), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <MetricDefinitionCard sensor={sensor} />
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('MetricDefinitionCard', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('shows display name, machine name, unit label with its code, aggregation type and explanation - equivalent RMS', async () => {
    renderCard(sensorFor('velocity_rms_x_eq'));

    expect(screen.getByText('Velocity RMS X (equivalent RMS)')).toBeInTheDocument();
    expect(screen.getByText('velocity_rms_x_eq_1')).toBeInTheDocument();
    expect(screen.getByText(/^mm\/s/)).toBeInTheDocument();
    expect(screen.getByText('(unit code: mm_s)')).toBeInTheDocument();
    // The aggregation type's friendly label comes from the API catalog.
    expect(await screen.findByText('Equivalent RMS')).toBeInTheDocument();
    expect(screen.getByText('(EQUIVALENT_RMS)')).toBeInTheDocument();
    expect(screen.getByText(/duration-weighted root mean square/)).toBeInTheDocument();
    expect(screen.getByText(/Do not use a simple arithmetic mean/)).toBeInTheDocument();
  });

  it('maximum: explains that maximums are not averaged', async () => {
    renderCard(sensorFor('acceleration_rms_total_max'));
    expect(await screen.findByText('Maximum')).toBeInTheDocument();
    expect(screen.getByText(/highest five-second maximum/)).toBeInTheDocument();
    expect(screen.getByText(/Do not average maximum values/)).toBeInTheDocument();
  });

  it('relative spectrum energy is shown as such, with raw_energy as the technical code - never g', async () => {
    renderCard(sensorFor('energy_2x_total_mean'));
    expect(await screen.findByText('Weighted mean')).toBeInTheDocument();
    expect(screen.getByText(/^Relative spectrum energy/)).toBeInTheDocument();
    expect(screen.getByText('(unit code: raw_energy)')).toBeInTheDocument();
    expect(screen.getByText(/represented-duration-weighted mean/)).toBeInTheDocument();
    expect(screen.getByText(/not be accumulated physical energy/)).toBeInTheDocument();
    expect(screen.queryByText(/unit code: g\)/)).not.toBeInTheDocument();
  });

  it('a metric without a dimension shows the general dimension "Unit", not g', async () => {
    renderCard(sensorFor('crest_factor_x_mean'));
    expect(await screen.findByText('Weighted mean')).toBeInTheDocument();
    // The row label "Unit" plus the value "Unit" (the general dimension).
    expect(screen.getAllByText('Unit')).toHaveLength(2);
    expect(screen.getByText('(unit code: one)')).toBeInTheDocument();
  });

  it('temperature shows °C and RPM shows RPM', async () => {
    const { unmount } = renderCard(sensorFor('sensor_temperature_mean'));
    expect(await screen.findByText(/^°C/)).toBeInTheDocument();
    unmount();

    renderCard(sensorFor('shaft_rpm_mean'));
    expect(await screen.findByText(/^RPM/)).toBeInTheDocument();
    expect(screen.getByText(/true zero RPM is a valid stopped-machine value/)).toBeInTheDocument();
  });

  it('states that the aggregation is metadata only', async () => {
    renderCard(sensorFor('shaft_rpm_mean'));
    expect(screen.getByText(/metadata only: nothing is aggregated from it/)).toBeInTheDocument();
  });

  it('a known metric whose metadata is missing is a visible administrative error - nothing is guessed', async () => {
    renderCard(sensorFor('velocity_rms_x_eq', { unitCode: null, unitLabel: null, unitLabelHu: null, aggregationType: null, aggregationExplanation: null }));

    const alert = await screen.findByText(/known metric "velocity_rms_x_eq" but its unit or aggregation metadata is missing/);
    expect(alert).toHaveTextContent('expected unit code mm_s, aggregation type EQUIVALENT_RMS');
    // No invented unit or aggregation in the value cells.
    expect(screen.queryByText('mm/s')).not.toBeInTheDocument();
    expect(screen.queryByText('Equivalent RMS')).not.toBeInTheDocument();
  });

  it('an ordinary Sensor without metadata just says so', async () => {
    renderCard({ id: 9, deviceId: 1, externalSensorId: 'my_custom_tag', name: 'Custom', unitCode: 'bar' });
    expect(await screen.findByText('This Sensor has no unit / aggregation metadata.')).toBeInTheDocument();
    // Its free-text unit is shown as it is, without an invented label.
    expect(screen.getByText(/^bar/)).toBeInTheDocument();
  });
});
