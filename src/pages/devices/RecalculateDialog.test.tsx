import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { RecalculateDialog } from './RecalculateDialog';
import { isDeleteOnly, isRecalculable } from '@/lib/recalculation';
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

  it('every Sensor not in maintenance can be recalculated; one with calculation off is only deleted from', () => {
    expect(isRecalculable(sensor(1))).toBe(true);
    expect(isRecalculable(sensor(1, { processingEnabled: false }))).toBe(true);
    expect(isRecalculable(sensor(1, { maintenanceMode: true }))).toBe(false);
    expect(isDeleteOnly(sensor(1))).toBe(false);
    expect(isDeleteOnly(sensor(1, { processingEnabled: false }))).toBe(true);
    expect(isDeleteOnly(sensor(1, { processingEnabled: undefined }))).toBe(false); // an older API sends no flag: counts as on
  });

  it('one Sensor with calculation off: says it is only deleted (nothing calculated) and sends the same POST', async () => {
    const calls: string[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      calls.push(new URL((input as Request).url).pathname);
      return accepted({ deviceId: 4, jobId: 'j1', sensorIds: [3], deleteOnlySensorIds: [3], skipped: [] });
    });
    let closed = false;
    const user = userEvent.setup();
    const off = sensor(3, { processingEnabled: false });
    renderDialog([off], off, () => {
      closed = true;
    });

    expect(screen.getByText('Delete the calculated values of S3?')).toBeInTheDocument();
    expect(screen.getByText(/only deleted - nothing is calculated/)).toBeInTheDocument();
    expect(screen.getByText(/Switching the raw calculation on later calculates everything again/)).toBeInTheDocument();
    expect(screen.getByText(/anomaly scores and the control limits \(UCL3, UCL2, LCL2, LCL3\)/)).toBeInTheDocument(); // calculation off: the limits go too
    expect(screen.queryByText(/in time order, in batches/)).not.toBeInTheDocument();
    expect(screen.queryByText(/aggregated again/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(calls).toEqual(['/api/Devices/4/Sensors/3/Recalculate']);
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
    expect(screen.getByText(/in time order, in batches/)).toBeInTheDocument();
    expect(screen.getByText(/The control limits \(UCL3, UCL2, LCL2, LCL3\) are kept/)).toBeInTheDocument(); // calculation on: the limits stay
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); // a single Sensor needs only the confirmation

    await user.click(screen.getByRole('button', { name: 'Recalculate' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(calls).toEqual([{ method: 'POST', path: '/api/Devices/4/Sensors/1/Recalculate' }]);
  });

  it('all Sensors: the button names how many are taken, calculation-off ones are only deleted from, maintenance ones left out, and it needs the acknowledgement', async () => {
    const calls: { method: string; path: string }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      calls.push({ method: request.method, path: new URL(request.url).pathname });
      return accepted({ deviceId: 4, jobId: 'j1', sensorIds: [1, 2, 3], deleteOnlySensorIds: [3], skipped: [{ sensorId: 4, name: 'S4', reason: 'The Sensor is in maintenance mode.' }] });
    });
    let closed = false;
    const user = userEvent.setup();
    renderDialog([sensor(1), sensor(2), sensor(3, { processingEnabled: false }), sensor(4, { maintenanceMode: true })], undefined, () => {
      closed = true;
    });

    expect(screen.getByText(/3 Sensor\(s\) of this Device is deleted/)).toBeInTheDocument();
    expect(screen.getByText(/1 Sensor\(s\) have the raw calculation switched off: only their raw results are deleted/)).toBeInTheDocument();
    expect(screen.getByText(/2 Sensor\(s\) are\s+recalculated/)).toBeInTheDocument();
    expect(screen.getByText(/1 Sensor\(s\) are left out because they are in maintenance mode/)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Recalculate 3 Sensor(s)' });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: /calculated values and the unreviewed Issues of these Sensors are deleted/ }));
    await user.click(screen.getByRole('button', { name: 'Recalculate 3 Sensor(s)' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(calls).toEqual([{ method: 'POST', path: '/api/Devices/4/Recalculate' }]);
  });

  it('a pasted list limits the Device-wide Recalc to those Sensors: the count follows the list, an unknown name blocks it, and the POST carries the ids', async () => {
    const calls: { path: string; body: unknown }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      calls.push({ path: new URL(request.url).pathname, body: await request.clone().json().catch(() => undefined) });
      return accepted({ deviceId: 4, jobId: 'j1', sensorIds: [1, 3], skipped: [] });
    });
    const user = userEvent.setup();
    renderDialog([sensor(1), sensor(2), sensor(3), sensor(4)]);

    const textarea = screen.getByRole('textbox', { name: /Only these Sensors/ });
    await user.click(textarea);
    await user.paste('s3\nnope\n');
    expect(await screen.findByText(/Not a Sensor of this Device: nope/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /calculated values and the unreviewed Issues of these Sensors are deleted/ }));
    expect(screen.getByRole('button', { name: 'Recalculate 1 Sensor(s)' })).toBeDisabled(); // an unknown name blocks it

    await user.clear(textarea);
    await user.click(textarea);
    await user.paste('SensorName\ns3\ns1\n');
    expect(await screen.findByText(/2 Sensor\(s\) listed/)).toBeInTheDocument();
    expect(screen.getByText(/The other Sensors of this Device are not touched/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Recalculate 2 Sensor(s)' }));

    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toEqual({ path: '/api/Devices/4/Recalculate', body: { sensorIds: [3, 1] } });
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
