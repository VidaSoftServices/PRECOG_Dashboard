import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DescriptionsDialog } from './DescriptionsDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const SENSORS = [
  { id: 1, externalSensorId: 'temp_a' },
  { id: 2, externalSensorId: 'rpm_b' },
];
const STORED = [
  { sensorId: 1, externalSensorId: 'temp_a', language: 'en', description: '## Temp\n\nIt shows, with a comma', updatedAt: '2026-11-19T00:00:00Z' },
  { sensorId: 1, externalSensorId: 'temp_a', language: 'hu', description: '## Hőmérséklet', updatedAt: '2026-11-19T00:00:00Z' },
];

interface Write {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

function mockApi(stored: unknown[] = STORED) {
  const writes: Write[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    if (request.method === 'GET') {
      if (path === '/api/Devices/4/Sensors') return json(SENSORS);
      if (path === '/api/Devices/4/SensorDescriptions') return json(stored);
      return json([]);
    }
    const text = await request.clone().text();
    writes.push({ method: request.method, path, body: text ? (JSON.parse(text) as Record<string, unknown>) : undefined });
    return request.method === 'DELETE' ? json({ deleted: stored.length }) : json({ created: 1, updated: 0, unchanged: 0 });
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
          <DescriptionsDialog deviceId={4} deviceName="Pump 1" open onClose={() => undefined} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

function captureDownload() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    return 'blob:descriptions';
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

describe('DescriptionsDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('says how many descriptions are stored, in each language', async () => {
    mockApi();
    renderDialog();
    expect(await screen.findByText(/2 descriptions are stored for this Device \(English 1, Hungarian 1\)/)).toBeInTheDocument();
  });

  it('exports the stored descriptions as a sheet that can be imported again', async () => {
    mockApi();
    const download = captureDownload();
    try {
      const user = userEvent.setup();
      renderDialog();
      const button = screen.getByRole('button', { name: 'Export descriptions' });
      await waitFor(() => expect(button).toBeEnabled());
      await user.click(button);
      await waitFor(() => expect(download.names).toEqual(['descriptions-device-4-Pump_1.csv']));
      const text = (await readBlob(download.blobs[0]!)).replace(/^\uFEFF/, '');
      expect(text.split('\r\n')[0]).toBe('SensorName,Language,Description');
      expect(text).toContain('temp_a,EN,"## Temp\n\nIt shows, with a comma"');
      expect(text).toContain('temp_a,HU,## Hőmérséklet');
    } finally {
      download.restore();
    }
  });

  it('imports a sheet: the rows go to the API by Sensor id, language and text', async () => {
    const writes = mockApi([]);
    const user = userEvent.setup();
    renderDialog();
    fireEvent.change(screen.getByRole('textbox', { name: '…or paste the cells (Excel) here' }), {
      target: { value: 'sensorName,language,description\nrpm_b,HU,## Fordulatszám\nrpm_b,EN,## Speed\nunknown_x,EN,ignored' },
    });
    const button = await screen.findByRole('button', { name: 'Import 2 descriptions' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/Devices/4/SensorDescriptions' });
    expect(writes[0]!.body).toEqual({
      items: [
        { sensorId: 2, language: 'hu', description: '## Fordulatszám' },
        { sensorId: 2, language: 'en', description: '## Speed' },
      ],
    });
  });

  it('removes every description only after the acknowledgement', async () => {
    const writes = mockApi();
    const user = userEvent.setup();
    renderDialog();
    const remove = await screen.findByRole('button', { name: 'Remove all descriptions' });
    expect(remove).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(remove).toBeEnabled());
    await user.click(remove);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ method: 'DELETE', path: '/api/Devices/4/SensorDescriptions' });
  });
});
