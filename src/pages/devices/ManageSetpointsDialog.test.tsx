import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ManageSetpointsDialog } from './ManageSetpointsDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const D = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString();
const SENSORS = [
  { id: 1, externalSensorId: 'temp_a', direction: 'lowerisbetter' },
  { id: 2, externalSensorId: 'rpm_b', direction: 'bidirectional' },
  { id: 3, externalSensorId: 'press_c', direction: 'higherisbetter' },
];
const STORED = [
  { id: 11, sensorId: 1, validFrom: D(1), validTo: D(10), target: 5, tolerance: 1 },
  { id: 12, sensorId: 1, validFrom: D(10), validTo: D(20), target: 6, tolerance: 1 },
  { id: 13, sensorId: 1, validFrom: D(20), validTo: null, target: 7, tolerance: 2 },
  { id: 21, sensorId: 2, validFrom: D(1), validTo: null, targetAbove: 100, toleranceAbove: 5, targetBelow: 50, toleranceBelow: 5 },
];
const HEADER = 'sensorName,validFrom,validTo,target,tolerance,targetAbove,targetBelow,toleranceAbove,toleranceBelow';

interface Write {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

function mockApi() {
  const writes: Write[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    if (request.method === 'GET') {
      if (path === '/api/Devices/4/Sensors') return json(SENSORS);
      if (path === '/api/Devices/4/Setpoints') return json(STORED);
      return json([]);
    }
    const text = await request.clone().text();
    writes.push({ method: request.method, path, body: text ? (JSON.parse(text) as Record<string, unknown>) : undefined });
    return request.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ id: 900 }, 201);
  });
  return writes;
}

function renderDialog() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <ManageSetpointsDialog deviceId={4} open onClose={() => undefined} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

function paste(rows: string[]) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Setpoint sheet' }), { target: { value: [HEADER, ...rows].join('\n') } });
}

function captureDownload() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    return 'blob:setpoints';
  };
  URL.revokeObjectURL = () => undefined;
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    names.push(this.download);
  };
  return { blobs, names, restore: () => (HTMLAnchorElement.prototype.click = click) };
}

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

describe('ManageSetpointsDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('exports every Sensor with every interval, a bare row for a Sensor with none', async () => {
    mockApi();
    const download = captureDownload();
    try {
      const user = userEvent.setup();
      renderDialog();
      const button = screen.getByRole('button', { name: 'Export all setpoints' });
      await waitFor(() => expect(button).toBeEnabled());
      await user.click(button);
      await waitFor(() => expect(download.names).toEqual(['setpoints-device-4.csv']));
      const lines = (await readBlob(download.blobs[0]!)).replace(/^\uFEFF/, '').trim().split('\r\n');
      expect(lines[0]).toBe(HEADER);
      expect(lines).toContain('temp_a,2026-01-10T00:00:00Z,2026-01-20T00:00:00Z,6,1,,,,');
      expect(lines).toContain('rpm_b,2026-01-01T00:00:00Z,,,,100,50,5,5');
      expect(lines).toContain('press_c,,,,,,,,');
    } finally {
      download.restore();
    }
  });

  it('a row removed from the sheet deletes that interval after confirmation; a Sensor not in the sheet is not touched', async () => {
    const writes = mockApi();
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export all setpoints' })).toBeEnabled());

    // temp_a without its middle interval (id 12); rpm_b and press_c are not in the sheet.
    paste(['temp_a,2026-01-01T00:00:00Z,2026-01-10T00:00:00Z,5,1,,,,', 'temp_a,2026-01-20T00:00:00Z,,7,2,,,,']);
    expect(await screen.findByText(/1 Sensor\(s\) in the sheet/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Planned changes' })).toHaveTextContent(/DELETE\s+temp_a\s+2026-01-10/);
    expect(screen.getByText(/2 other Sensor\(s\) of this Device are not in the sheet and are not touched/)).toBeInTheDocument();

    const apply = screen.getByRole('button', { name: 'Apply 1 change(s)' });
    expect(apply).toBeDisabled(); // a deletion needs the explicit confirmation
    await user.click(screen.getByRole('checkbox', { name: /I understand that 1 stored setpoint interval\(s\) will be permanently deleted/ }));
    await user.click(apply);

    expect((await screen.findAllByText(/1 deleted, 0 created/)).length).toBeGreaterThan(0);
    expect(writes).toEqual([{ method: 'DELETE', path: '/api/Devices/4/Sensors/1/Setpoints/12', body: undefined }]);
  });

  it('a changed row replaces its interval: the old one is deleted first, then the new values are created, in order', async () => {
    const writes = mockApi();
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export all setpoints' })).toBeEnabled());

    paste([
      'temp_a,2026-01-01T00:00:00Z,2026-01-10T00:00:00Z,5,1,,,,', // unchanged
      'temp_a,2026-01-10T00:00:00Z,2026-01-20T00:00:00Z,6.5,1,,,,', // a new target for the same validFrom
      'temp_a,2026-01-20T00:00:00Z,2026-03-01T00:00:00Z,7,2,,,,', // gets a validTo
      'temp_a,2026-03-01T00:00:00Z,,9,3,,,,', // a brand new interval
    ]);
    expect(await screen.findByText(/1 Sensor\(s\) in the sheet, 1 would change/)).toBeInTheDocument();
    // two replaced intervals (a delete AND a create each) plus one brand new interval = 5 requests
    await user.click(screen.getByRole('checkbox', { name: /I understand that 2 stored setpoint interval\(s\) will be permanently deleted \(2 of them are created again/ }));
    await user.click(screen.getByRole('button', { name: 'Apply 5 change(s)' }));

    expect((await screen.findAllByText(/2 deleted, 3 created/)).length).toBeGreaterThan(0);
    expect(writes.map((w) => `${w.method} ${w.path.replace('/api/Devices/4/Sensors/1/Setpoints', '')}`)).toEqual(['DELETE /12', 'DELETE /13', 'POST ', 'POST ', 'POST ']);
    expect(writes[2]!.body).toMatchObject({ validFrom: '2026-01-10T00:00:00.000Z', validTo: '2026-01-20T00:00:00.000Z', target: 6.5, tolerance: 1 });
    expect(writes[3]!.body).toMatchObject({ validFrom: '2026-01-20T00:00:00.000Z', validTo: '2026-03-01T00:00:00.000Z' });
    expect(writes[4]!.body).toMatchObject({ validFrom: '2026-03-01T00:00:00.000Z', target: 9, tolerance: 3 });
    expect(writes[4]!.body).not.toHaveProperty('validTo');
  });

  it('a Sensor that keeps only its name loses all its setpoints', async () => {
    const writes = mockApi();
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export all setpoints' })).toBeEnabled());

    paste(['temp_a,,,,,,,,']);
    await user.click(await screen.findByRole('checkbox', { name: /I understand that 3 stored setpoint interval/ }));
    await user.click(screen.getByRole('button', { name: 'Apply 3 change(s)' }));

    expect((await screen.findAllByText(/3 deleted, 0 created/)).length).toBeGreaterThan(0);
    expect(writes.map((w) => `${w.method} ${w.path}`)).toEqual([
      'DELETE /api/Devices/4/Sensors/1/Setpoints/11',
      'DELETE /api/Devices/4/Sensors/1/Setpoints/12',
      'DELETE /api/Devices/4/Sensors/1/Setpoints/13',
    ]);
  });

  it('an unchanged export applies nothing, and a sheet with problems cannot be applied (nothing is sent)', async () => {
    const writes = mockApi();
    renderDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export all setpoints' })).toBeEnabled());

    // temp_a with all three of its stored rows, exactly as exported
    paste(['temp_a,2026-01-01T00:00:00Z,2026-01-10T00:00:00Z,5,1,,,,', 'temp_a,2026-01-10T00:00:00Z,2026-01-20T00:00:00Z,6,1,,,,', 'temp_a,2026-01-20T00:00:00Z,,7,2,,,,']);
    expect(await screen.findByText(/1 Sensor\(s\) in the sheet, 0 would change/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    paste(['nope,2026-01-01T00:00:00Z,,5,1,,,,', 'temp_a,garbage,,5,1,,,,']);
    expect(await screen.findByText(/2 problem\(s\)/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Rows with problems' })).toHaveTextContent(/not a Sensor of this Device/);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(writes).toEqual([]);
  });
});
