import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { BulkAggregationDialog } from './BulkAggregationDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import type { SensorDto } from '@/api/hooks/sensors';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const sensor = (id: number, name: string): SensorDto => ({ id, name, externalSensorId: `ext-${id}` }) as SensorDto;
const SENSORS = [sensor(1, 'Acceleration RMS X'), sensor(2, 'Acceleration RMS Y'), sensor(3, 'Temperature')];

function renderDialog(onClose = () => undefined) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <BulkAggregationDialog deviceId={4} sensors={SENSORS} open onClose={onClose} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function recordCalls(response: unknown): Call[] {
  const calls: Call[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    calls.push({ method: request.method, path: new URL(request.url).pathname, body: request.method === 'POST' ? await request.clone().json() : undefined });
    return json(response);
  });
  return calls;
}

describe('BulkAggregationDialog', { timeout: 30_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('the button stays disabled until the level is complete; then ONE request for all Sensors, with no sensorIds and no data key', async () => {
    const calls = recordCalls({
      created: 3,
      reactivated: 0,
      alreadyExisted: 0,
      skipped: 0,
      items: [{ sensorId: 1, name: 'Acceleration RMS X', outcome: 'Created' }],
    });
    const user = userEvent.setup();
    renderDialog();

    const button = () => screen.getByRole('button', { name: /^Add for \d+ Sensor/ });
    expect(button()).toBeDisabled();
    await user.selectOptions(screen.getByRole('combobox', { name: /Time scale/ }), 'Minutes15');
    await user.selectOptions(screen.getByRole('combobox', { name: /Aggregation function/ }), 'AVG');
    expect(button()).toBeDisabled(); // lookback and scale are still missing
    await user.type(screen.getByRole('spinbutton', { name: /Lookback/ }), '100');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Scale/ }), 'Years');
    expect(button()).toBeEnabled();
    expect(screen.getByText(/15 minutes · Average/)).toBeInTheDocument();
    expect(button()).toHaveTextContent('Add for 3 Sensor(s)');

    await user.click(button());

    expect(await screen.findByText(/3 created, 0 switched on again, 0 already existed, 0 not found\./)).toBeInTheDocument();
    expect(screen.getByText(/Acceleration RMS X/)).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.path).toBe('/api/Devices/4/AggregationPolicies');
    const body = calls[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({ timeScale: 'Minutes15', aggregationFunction: 'AVG', scale: 'Years', lookback: 100, timeZone: 'UTC' });
    expect(body.sensorIds).toBeUndefined(); // empty = every Sensor of the Device
    expect(body.sourceDataKey).toBeUndefined(); // the source is always the measured value, never a choice
  });

  it('chosen Sensors: the filter narrows the list, "Choose the shown" ticks them, and only those ids are sent', async () => {
    const calls = recordCalls({ created: 2, items: [] });
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(screen.getByRole('combobox', { name: /Time scale/ }), 'Hours');
    await user.selectOptions(screen.getByRole('combobox', { name: /Aggregation function/ }), 'MAX');
    await user.type(screen.getByRole('spinbutton', { name: /Lookback/ }), '5');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Scale/ }), 'Days');
    await user.click(screen.getByRole('radio', { name: /Only the Sensors I choose/ }));
    expect(screen.getByRole('button', { name: /^Add for 0 Sensor/ })).toBeDisabled(); // none chosen yet

    await user.type(screen.getByRole('textbox', { name: 'Filter Sensors' }), 'acceleration');
    expect(screen.queryByRole('checkbox', { name: 'Temperature' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose the 2 shown' }));
    expect(screen.getByRole('button', { name: 'Add for 2 Sensor(s)' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Add for 2 Sensor(s)' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0]?.body as { sensorIds: number[] }).sensorIds).toEqual([1, 2]);
  });

  it('deactivate: needs only the level and the Sensors, and posts to the Deactivate route', async () => {
    const calls = recordCalls({ deactivated: 3, skipped: 0, items: [] });
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: 'Deactivate the level' }));
    expect(screen.queryByRole('spinbutton', { name: /Lookback/ })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: /Time scale/ }), 'Days');
    await user.selectOptions(screen.getByRole('combobox', { name: /Aggregation function/ }), 'AVG');
    await user.click(screen.getByRole('button', { name: 'Deactivate for 3 Sensor(s)' }));

    expect(await screen.findByText(/3 deactivated, 0 left as they were\./)).toBeInTheDocument();
    expect(calls[0]?.path).toBe('/api/Devices/4/AggregationPolicies/Deactivate');
    expect(calls[0]?.body).toEqual({ timeScale: 'Days', aggregationFunction: 'AVG' });
  });

  it('shows the API remark per Sensor (a level that is stored but not calculated) and the refusal of a bad request', async () => {
    fetchMock().mockImplementation(
      async () =>
        new Response(JSON.stringify("TimeZone 'Mars/Olympus_Mons' is not a known IANA time zone."), { status: 400, headers: { 'content-type': 'application/json' } }),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.selectOptions(screen.getByRole('combobox', { name: /Time scale/ }), 'Days');
    await user.selectOptions(screen.getByRole('combobox', { name: /Aggregation function/ }), 'AVG');
    await user.type(screen.getByRole('spinbutton', { name: /Lookback/ }), '1');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Scale/ }), 'Days');
    await user.click(screen.getByRole('button', { name: 'Add for 3 Sensor(s)' }));

    expect(await screen.findByText(/not a known IANA time zone/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument(); // still on the form, nothing pretended
  });
});
