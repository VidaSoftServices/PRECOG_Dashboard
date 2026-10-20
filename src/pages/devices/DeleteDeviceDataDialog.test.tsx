import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DeleteDeviceDataDialog } from './DeleteDeviceDialog';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

interface Sent {
  method: string;
  url: string;
  body: Record<string, unknown>;
}

const RESULT = {
  deviceId: 4,
  externalDeviceId: 'ext-4',
  deviceName: 'Press 7',
  sensorsAffected: 12,
  telemetryRowsDeleted: 4500,
  aggregationRowsDeleted: 10,
  issuesDeleted: 3,
  modelVersionsDeleted: 1,
  trainingRequestsDeleted: 2,
  retrainingScheduledForDeviceIds: [],
};

function mockApi(respond: () => Response = () => new Response(JSON.stringify(RESULT), { status: 200, headers: { 'content-type': 'application/json' } })): Sent[] {
  const sent: Sent[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    sent.push({ method: request.method, url: request.url, body: (await request.clone().json().catch(() => ({}))) as Record<string, unknown> });
    return respond();
  });
  return sent;
}

function renderDialog(device: { deviceName?: string | null; externalDeviceId?: string | null } = { deviceName: 'Press 7', externalDeviceId: 'ext-4' }) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <DeleteDeviceDataDialog deviceId={4} device={device} open onClose={onClose} onDeleted={onDeleted} />
      </QueryClientProvider>
    </FluentProvider>,
  );
  return { onClose, onDeleted };
}

// Fluent dialogs are slow to mount under a loaded full-suite run; the default 5 s is too tight.
describe('DeleteDeviceDataDialog', { timeout: 20_000 }, () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('warns first: what is deleted (data, Issues, models), what is KEPT, backup, duration - and sends nothing', async () => {
    const sent = mockApi();
    renderDialog();

    expect(await screen.findByText('Delete all data of this device?')).toBeInTheDocument();
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    expect(screen.getByText(/every measured value of every Sensor/)).toBeInTheDocument();
    expect(screen.getByText(/aggregated values and queued aggregation work/)).toBeInTheDocument();
    expect(screen.getByText(/all Issues with their reviews/)).toBeInTheDocument();
    expect(screen.getByText(/all trained models and training requests/)).toBeInTheDocument();
    // What stays is stated just as clearly.
    expect(screen.getByText('It keeps:')).toBeInTheDocument();
    expect(screen.getByText(/the device itself and all of its Sensors with their settings/)).toBeInTheDocument();
    expect(screen.getByText(/knowledge shares \(only the Issues listed in them are removed\)/)).toBeInTheDocument();
    expect(screen.getByText(/scheduled for retraining/)).toBeInTheDocument();
    expect(screen.getByText(/database backup first/)).toBeInTheDocument();
    expect(screen.getByText(/several minutes/)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('the delete button stays disabled until the exact device name is typed', async () => {
    mockApi();
    const user = userEvent.setup();
    renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Continue…' }));
    expect(await screen.findByText('Type the device name to confirm')).toBeInTheDocument();
    const remove = screen.getByRole('button', { name: 'Delete all data' });
    const input = screen.getByRole('textbox', { name: 'Device name' });
    expect(remove).toBeDisabled();

    await user.type(input, 'press 7');
    expect(remove).toBeDisabled();
    await user.clear(input);
    await user.type(input, 'Press 7');
    expect(remove).toBeEnabled();
  });

  it('calls DELETE .../Data with the typed name and reports the result', async () => {
    const sent = mockApi();
    const user = userEvent.setup();
    const { onDeleted } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Continue…' }));
    await user.type(await screen.findByRole('textbox', { name: 'Device name' }), 'Press 7');
    await user.click(screen.getByRole('button', { name: 'Delete all data' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(onDeleted.mock.calls[0]![0]).toMatchObject({ telemetryRowsDeleted: 4500, sensorsAffected: 12, issuesDeleted: 3, modelVersionsDeleted: 1 });
    const request = sent.find((s) => s.method === 'DELETE')!;
    expect(request.url).toMatch(/\/api\/Devices\/4\/Data$/); // NOT /api/Devices/4 - that would delete the device
    expect(request.body).toEqual({ confirmDeviceName: 'Press 7' });
  });

  it('a refusal from the server is shown and nothing is reported as deleted', async () => {
    mockApi(() => new Response('A training request for this Device is being worked on right now.', { status: 409 }));
    const user = userEvent.setup();
    const { onDeleted } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Continue…' }));
    await user.type(await screen.findByRole('textbox', { name: 'Device name' }), 'Press 7');
    await user.click(screen.getByRole('button', { name: 'Delete all data' }));

    expect(await screen.findByText(/being worked on right now/)).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('cancelling at the warning sends nothing', async () => {
    const sent = mockApi();
    const user = userEvent.setup();
    const { onClose, onDeleted } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('a device without a name is confirmed by its external id', async () => {
    const sent = mockApi();
    const user = userEvent.setup();
    const { onDeleted } = renderDialog({ deviceName: '', externalDeviceId: 'ext-4' });

    await user.click(await screen.findByRole('button', { name: 'Continue…' }));
    await user.type(await screen.findByRole('textbox', { name: 'Device name' }), 'ext-4');
    await user.click(screen.getByRole('button', { name: 'Delete all data' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(sent.find((s) => s.method === 'DELETE')!.body).toEqual({ confirmDeviceName: 'ext-4' });
  });
});
