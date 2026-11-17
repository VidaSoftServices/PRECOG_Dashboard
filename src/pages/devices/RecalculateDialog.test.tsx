import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { RecalculateDialog } from './RecalculateDialog';
import { isRecalculable } from '@/lib/recalculation';
import { AppToastProvider } from '@/components/ToastProvider';
import type { SensorDto } from '@/api/hooks/sensors';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const sensor = (id: number, extra: Partial<SensorDto> = {}): SensorDto =>
  ({ id, name: `S${id}`, externalSensorId: `s${id}`, processingEnabled: true, maintenanceMode: false, ...extra }) as SensorDto;

function renderDialog(sensors: SensorDto[], one?: SensorDto, onClose = () => undefined) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <RecalculateDialog deviceId={4} sensor={one} sensors={sensors} open onClose={onClose} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const accepted = (body: unknown = { deviceId: 4, jobId: 'j1', sensorIds: [1], skipped: [] }) =>
  new Response(JSON.stringify(body), { status: 202, headers: { 'content-type': 'application/json' } });

describe('RecalculateDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('only a Sensor with calculation on and not in maintenance can be recalculated', () => {
    expect(isRecalculable(sensor(1))).toBe(true);
    expect(isRecalculable(sensor(1, { processingEnabled: false }))).toBe(false);
    expect(isRecalculable(sensor(1, { maintenanceMode: true }))).toBe(false);
    expect(isRecalculable(sensor(1, { processingEnabled: undefined }))).toBe(true); // an older API sends no flag: counts as on
  });

  it('one Sensor: says what is deleted and what is kept, asks for confirmation, and sends one POST for that Sensor', async () => {
    const calls: { method: string; path: string }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      calls.push({ method: request.method, path: new URL(request.url).pathname });
      return accepted();
    });
    let closed = false;
    const user = userEvent.setup();
    const s1 = sensor(1);
    renderDialog([s1, sensor(2)], s1, () => {
      closed = true;
    });

    expect(screen.getByText(/Recalculate S1 from the start\?/)).toBeInTheDocument();
    expect(screen.getByText(/every Issue that no person has reviewed/)).toBeInTheDocument();
    expect(screen.getByText(/Issues a person has reviewed/)).toBeInTheDocument();
    expect(screen.getByText(/one by one, in time order/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); // a single Sensor needs only the confirmation

    await user.click(screen.getByRole('button', { name: 'Recalculate' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(calls).toEqual([{ method: 'POST', path: '/api/Devices/4/Sensors/1/Recalculate' }]);
  });

  it('all Sensors: the button names how many are recalculated, the others are listed as left out, and it needs the acknowledgement', async () => {
    const calls: { method: string; path: string }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      calls.push({ method: request.method, path: new URL(request.url).pathname });
      return accepted({ deviceId: 4, jobId: 'j1', sensorIds: [1, 2], skipped: [{ sensorId: 3, name: 'S3', reason: 'Calculation is switched off for this Sensor.' }] });
    });
    let closed = false;
    const user = userEvent.setup();
    renderDialog([sensor(1), sensor(2), sensor(3, { processingEnabled: false }), sensor(4, { maintenanceMode: true })], undefined, () => {
      closed = true;
    });

    expect(screen.getByText(/2 Sensor\(s\) of this Device/)).toBeInTheDocument();
    expect(screen.getByText(/2 Sensor\(s\) are left out because calculation is switched off/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Recalculate 2 Sensor(s)' });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /calculated values and the unreviewed Issues of these Sensors are deleted/ }));
    await user.click(screen.getByRole('button', { name: 'Recalculate 2 Sensor(s)' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(calls).toEqual([{ method: 'POST', path: '/api/Devices/4/Recalculate' }]);
  });

  it('shows the server refusal (a recalculation already runs) and stays open', async () => {
    fetchMock().mockImplementation(
      async () => new Response('A recalculation is already running for this Device.', { status: 409, headers: { 'content-type': 'application/json' } }),
    );
    let closed = false;
    const user = userEvent.setup();
    const s1 = sensor(1);
    renderDialog([s1], s1, () => {
      closed = true;
    });

    await user.click(screen.getByRole('button', { name: 'Recalculate' }));

    expect(await screen.findByText(/already running/)).toBeInTheDocument();
    expect(closed).toBe(false);
  });
});
