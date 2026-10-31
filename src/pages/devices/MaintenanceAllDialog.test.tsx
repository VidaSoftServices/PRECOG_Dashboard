import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { MaintenanceAllDialog } from './MaintenanceAllDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import type { SensorDto } from '@/api/hooks/sensors';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const sensor = (id: number, maintenanceMode: boolean): SensorDto => ({ id, name: `S${id}`, externalSensorId: `s${id}`, maintenanceMode }) as SensorDto;

function renderDialog(sensors: SensorDto[], onClose = () => undefined) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <MaintenanceAllDialog deviceId={4} sensors={sensors} open onClose={onClose} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const ok = () =>
  new Response(JSON.stringify({ deviceId: 4, anySensorInMaintenance: true, sensors: [] }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('MaintenanceAllDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('with nothing in maintenance: starting is preselected, needs the acknowledgement, and sends ONE request for the whole Device', async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      calls.push({ method: request.method, path: new URL(request.url).pathname, body: request.method === 'PUT' ? await request.clone().json() : undefined });
      return ok();
    });
    let closed = false;
    const user = userEvent.setup();
    renderDialog([sensor(1, false), sensor(2, false), sensor(3, false)], () => {
      closed = true;
    });

    expect(screen.getByText(/0 of 3 Sensor\(s\) of this Device are in maintenance mode now/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Start maintenance on all Sensors/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /End maintenance on all Sensors/ })).toBeDisabled(); // nothing to end
    const confirm = screen.getByRole('button', { name: 'Start maintenance on 3 Sensor(s)' });
    expect(confirm).toBeDisabled(); // data is lost: an explicit acknowledgement first
    expect(screen.getByText(/cannot be recovered afterwards/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /telemetry of all these Sensors is lost/ }));
    await user.click(screen.getByRole('button', { name: 'Start maintenance on 3 Sensor(s)' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(calls).toEqual([{ method: 'PUT', path: '/api/Devices/4/Maintenance', body: { enabled: true } }]);
  });

  it('with everything in maintenance: ending is preselected, needs no acknowledgement, and starting is disabled', async () => {
    const bodies: unknown[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      if (request.method === 'PUT') bodies.push(await request.clone().json());
      return ok();
    });
    let closed = false;
    const user = userEvent.setup();
    renderDialog([sensor(1, true), sensor(2, true)], () => {
      closed = true;
    });

    expect(screen.getByRole('radio', { name: /End maintenance on all Sensors/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Start maintenance on all Sensors/ })).toBeDisabled(); // nothing to start
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'End maintenance on 2 Sensor(s)' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(bodies).toEqual([{ enabled: false }]);
  });

  it('with a mix: nothing is preselected, the counts say how many Sensors each choice changes, and the choice decides what is sent', async () => {
    const bodies: unknown[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      if (request.method === 'PUT') bodies.push(await request.clone().json());
      return ok();
    });
    let closed = false;
    const user = userEvent.setup();
    renderDialog([sensor(1, true), sensor(2, false), sensor(3, false), sensor(4, false)], () => {
      closed = true;
    });

    expect(screen.getByText(/1 of 4 Sensor\(s\)/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Start maintenance on all Sensors \(3 not in maintenance yet\)/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /End maintenance on all Sensors \(1 in maintenance now\)/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /End maintenance on all Sensors/ }));
    await user.click(screen.getByRole('button', { name: 'End maintenance on 1 Sensor(s)' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(bodies).toEqual([{ enabled: false }]);
  });

  it('shows the server\'s refusal and stays open instead of pretending it worked', async () => {
    fetchMock().mockImplementation(
      async () => new Response(JSON.stringify('You need admin privileges to set maintenance mode.'), { status: 403, headers: { 'content-type': 'application/json' } }),
    );
    let closed = false;
    const user = userEvent.setup();
    renderDialog([sensor(1, true)], () => {
      closed = true;
    });

    await user.click(screen.getByRole('button', { name: 'End maintenance on 1 Sensor(s)' }));

    expect(await screen.findByText(/admin privileges/)).toBeInTheDocument();
    expect(closed).toBe(false);
  });
});
