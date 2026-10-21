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

  it('shows the display name, the Sensor name, and the unit label with its code', async () => {
    renderCard(sensorFor('velocity_rms_x_eq'));

    expect(screen.getByText('Velocity RMS X (equivalent RMS)')).toBeInTheDocument();
    expect(screen.getByText('Sensor name')).toBeInTheDocument(); // not "Machine name"
    expect(screen.queryByText('Machine name')).not.toBeInTheDocument();
    expect(screen.getByText('velocity_rms_x_eq_1')).toBeInTheDocument();
    expect(screen.getByText(/^mm\/s/)).toBeInTheDocument();
    expect(screen.getByText('(unit code: mm_s)')).toBeInTheDocument();
  });

  it('has no aggregation information at all', async () => {
    const { container } = renderCard(sensorFor('velocity_rms_x_eq'));
    await new Promise((r) => setTimeout(r, 50)); // let the catalog load
    expect(container.textContent ?? '').not.toMatch(/aggregation|Equivalent RMS|WEIGHTED_MEAN|EQUIVALENT_RMS|Explanation/);
  });

  it('relative spectrum energy is shown as such, with raw_energy as the technical code - never g', async () => {
    renderCard(sensorFor('energy_2x_total_mean'));
    expect(screen.getByText(/^Relative spectrum energy/)).toBeInTheDocument();
    expect(screen.getByText('(unit code: raw_energy)')).toBeInTheDocument();
    expect(screen.queryByText(/unit code: g\)/)).not.toBeInTheDocument();
  });

  it('a metric without a dimension shows the general dimension "Unit", not g', async () => {
    renderCard(sensorFor('crest_factor_x_mean'));
    // The row label "Unit" plus the value "Unit" (the general dimension).
    expect(screen.getAllByText('Unit')).toHaveLength(2);
    expect(screen.getByText('(unit code: one)')).toBeInTheDocument();
  });

  it('temperature shows °C and RPM shows RPM', async () => {
    const { unmount } = renderCard(sensorFor('sensor_temperature_mean'));
    expect(screen.getByText(/^°C/)).toBeInTheDocument();
    unmount();

    renderCard(sensorFor('shaft_rpm_mean'));
    expect(screen.getByText(/^RPM/)).toBeInTheDocument();
  });

  it('a known metric whose unit is missing is a visible administrative error - nothing is guessed', async () => {
    renderCard(sensorFor('velocity_rms_x_eq', { unitCode: null, unitLabel: null, unitLabelHu: null }));

    const alert = await screen.findByText(/known metric "velocity_rms_x_eq" but its unit is missing/);
    expect(alert).toHaveTextContent('expected unit code mm_s');
    // No invented unit in the value cell.
    expect(screen.queryByText('mm/s')).not.toBeInTheDocument();
  });

  it('an ordinary Sensor without a unit just says so', async () => {
    renderCard({ id: 9, deviceId: 1, externalSensorId: 'my_custom_tag', name: 'Custom' });
    expect(await screen.findByText('This Sensor has no unit.')).toBeInTheDocument();
  });

  it('an ordinary Sensor shows its free-text unit as it is, without an invented label', async () => {
    renderCard({ id: 9, deviceId: 1, externalSensorId: 'my_custom_tag', name: 'Custom', unitCode: 'bar' });
    expect(screen.getByText(/^bar/)).toBeInTheDocument();
    expect(screen.queryByText('This Sensor has no unit.')).not.toBeInTheDocument();
  });
});
