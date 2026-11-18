import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { BulkAggregationDialog } from './BulkAggregationDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import type { SensorDto } from '@/api/hooks/sensors';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

// The download itself needs a real browser; what would be offered is captured instead.
const downloads: { name: string; content: string }[] = [];
vi.mock('@/lib/downloadFile', () => ({
  downloadTextFile: (name: string, content: string) => {
    downloads.push({ name, content });
  },
}));

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

describe('BulkAggregationDialog: CSV import and export', { timeout: 30_000 }, () => {
  beforeEach(() => authStore.clearSession());

  // The shape of the prepared sheets (aggregation-KS5.csv): level and why are ignored, why has commas and quotes.
  const CSV = [
    'sensorName,level,timeScale,aggregationFunction,scale,lookback,minIssueScore,why',
    'ext-1,napi,Days,AVG,Periods,60,3,"napi szint, trend"',
    'ext-2,napi,Days,AVG,Periods,60,3,x',
    'ext-2,orás,Hours,MAX,Periods,336,2,"ütés ""max"""',
  ].join('\n');

  async function openImport() {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('radio', { name: 'Import from CSV' }));
    return user;
  }

  it('pasted rows with the same settings become ONE request each, with the Sensor ids; level and why are ignored', async () => {
    const calls = recordCalls({ created: 2, reactivated: 0, alreadyExisted: 0, skipped: 0, items: [{ sensorId: 1, name: 'Acceleration RMS X', outcome: 'Created' }] });
    const user = await openImport();

    fireEvent.change(screen.getByRole('textbox', { name: /paste the cells/ }), { target: { value: CSV } });

    expect(await screen.findByText(/3 row\(s\) for 2 Sensor\(s\) make 2 request\(s\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Ignored column/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import 2 level(s) for 2 Sensor(s)' }));

    expect((await screen.findAllByText(/created, 0 switched on again/)).length).toBeGreaterThan(0);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.path)).toEqual(['/api/Devices/4/AggregationPolicies', '/api/Devices/4/AggregationPolicies']);
    expect(calls[0]?.body).toEqual({ sensorIds: [1, 2], timeScale: 'Days', aggregationFunction: 'AVG', scale: 'Periods', lookback: 60, minIssueScore: 3, timeZone: 'UTC' });
    expect(calls[1]?.body).toEqual({ sensorIds: [2], timeScale: 'Hours', aggregationFunction: 'MAX', scale: 'Periods', lookback: 336, minIssueScore: 2, timeZone: 'UTC' });
  });

  it('a sheet with problems lists them by line and sends nothing', async () => {
    const calls = recordCalls({});
    const user = await openImport();

    fireEvent.change(screen.getByRole('textbox', { name: /paste the cells/ }), {
      target: { value: 'sensorName,timeScale,aggregationFunction,scale,lookback\nno-such,Days,AVG,Periods,60\next-1,Fortnight,AVG,Periods,60' },
    });

    expect(await screen.findByText(/Nothing is sent while the sheet has problems \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Line 2, sensorName: No Sensor "no-such" on this Device\./)).toBeInTheDocument();
    expect(screen.getByText(/Line 3, timeScale: "Fortnight" is not a time scale/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Import 0 level/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^Import 0 level/ }));
    expect(calls).toHaveLength(0);
  });

  it('stops at the first failing request and says what was done', async () => {
    let n = 0;
    fetchMock().mockImplementation(async () => {
      n += 1;
      return n === 1
        ? json({ created: 2, reactivated: 0, alreadyExisted: 0, skipped: 0, items: [{ sensorId: 1, name: 'Acceleration RMS X', outcome: 'Created' }] })
        : new Response(JSON.stringify('TimeZone is not a known IANA time zone.'), { status: 400, headers: { 'content-type': 'application/json' } });
    });
    const user = await openImport();

    fireEvent.change(screen.getByRole('textbox', { name: /paste the cells/ }), { target: { value: CSV } });
    await user.click(await screen.findByRole('button', { name: 'Import 2 level(s) for 2 Sensor(s)' }));

    expect(await screen.findByText(/The import stopped at an error/)).toBeInTheDocument();
    expect(screen.getByText(/Acceleration RMS X/)).toBeInTheDocument();
    expect(n).toBe(2);
  });

  it('Download current levels downloads the enabled aggregate levels of the Device in the importer columns', async () => {
    downloads.length = 0;
    fetchMock().mockImplementation(async () =>
      json([
        { id: 10, sensorId: 1, sourceDataKey: 'Actual', timeScale: 'Native', aggregationFunction: 'Raw', scale: 'years', lookback: 100, minIssueScore: 5, enabled: true },
        { id: 11, sensorId: 1, sourceDataKey: 'Actual', timeScale: 'Days', aggregationFunction: 'AVG', scale: 'periods', lookback: 60, minIssueScore: 3, enabled: true, timeZone: 'UTC' },
      ]),
    );
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('radio', { name: 'Import from CSV' }));

    await user.click(screen.getByRole('button', { name: 'Download current levels (CSV)' }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]?.name).toBe('aggregation-device-4.csv');
    expect(downloads[0]?.content).toContain('sensorName,level,timeScale,aggregationFunction,scale,lookback,minIssueScore,timeZone');
    expect(downloads[0]?.content).toContain('ext-1,1 day,Days,AVG,Periods,60,3,UTC');
    expect(downloads[0]?.content).not.toContain('Native');
  });
});

describe('BulkAggregationDialog: sample download and upload button', { timeout: 30_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('Import mode offers the sample, the current levels and an upload button; the sample is written for the Device Sensors', async () => {
    downloads.length = 0;
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('radio', { name: 'Import from CSV' }));

    expect(screen.getByRole('button', { name: 'Download current levels (CSV)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload CSV…' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download sample (CSV)' }));

    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.name).toBe('aggregation-template.csv');
    expect(downloads[0]?.content).toContain('sensorName,level,timeScale,aggregationFunction,scale,lookback,minIssueScore,timeZone');
    expect(downloads[0]?.content).toContain('ext-1,daily average,Days,AVG,Periods,60,3,UTC');
  });

  it('a file chosen with the upload button is read into the sheet and checked at once', async () => {
    recordCalls({});
    const user = userEvent.setup();
    const { container } = renderDialog();
    await user.click(screen.getByRole('radio', { name: 'Import from CSV' }));

    const input = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    const csv = 'sensorName,level,timeScale,aggregationFunction,scale,lookback,minIssueScore,why\next-1,napi,Days,AVG,Periods,60,3,x';
    await user.upload(input, new File([csv], 'aggregation-KS5.csv', { type: 'text/csv' }));

    expect(await screen.findByText(/1 row\(s\) for 1 Sensor\(s\) make 1 request\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('aggregation-KS5.csv')).toBeInTheDocument();
  });
});
