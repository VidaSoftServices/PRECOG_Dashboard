import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { SensorImportDialog } from './SensorImportDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

interface Posted {
  url: string;
  body: Record<string, unknown>;
}

/** Existing Sensors for GET, and a POST handler that assigns ids in call order - like the API's "max + 1". */
function mockApi(existing: { id: number; externalSensorId: string }[], failOn: (body: Record<string, unknown>) => Response | null = () => null): Posted[] {
  const posted: Posted[] = [];
  let nextId = existing.length + 1;
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (request.method === 'GET') return json(existing);
    const body = (await request.clone().json()) as Record<string, unknown>;
    const failure = failOn(body);
    if (failure) return failure;
    posted.push({ url: request.url, body });
    return json({ id: nextId++, externalSensorId: body.externalSensorId }, 201);
  });
  return posted;
}

function renderDialog(applicationMode = 'continuous') {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <SensorImportDialog deviceId={4} applicationMode={applicationMode} open onClose={() => undefined} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

/** Pasting is a single change event; typing 160 rows character by character would take minutes. */
function paste(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Sensor table' }), { target: { value: text } });
}

async function setDefaults(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole('dialog');
  await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Raw scale' }), 'Seconds');
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Raw lookback' }), { target: { value: '60' } });
}

// Fluent dialogs are slow to mount under a loaded full-suite run; the default 5 s is too tight.
describe('SensorImportDialog', { timeout: 20_000 }, () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('creates the Sensors one by one in sheet order, as signals for a continuous Device', async () => {
    const posted = mockApi([]);
    const user = userEvent.setup();
    renderDialog('continuous');

    paste('externalSensorId\tname\tunitCode\nb_1\tSecond\tmm\na_1\tFirst\tg\nc_1\tThird\tCel');
    await setDefaults(user);

    const importButton = await screen.findByRole('button', { name: 'Import 3 Sensor(s)' });
    await user.click(importButton);

    await waitFor(() => expect(posted).toHaveLength(3));
    // Sheet order, not alphabetical: the numeric ids the API assigns follow it.
    expect(posted.map((p) => p.body.externalSensorId)).toEqual(['b_1', 'a_1', 'c_1']);
    expect(posted[0]!.url).toContain('/api/Devices/4/Sensors');
    expect(posted[0]!.body).toMatchObject({
      name: 'Second',
      unitCode: 'mm',
      direction: 'lowerisbetter',
      isCurve: false,
      rawScale: 'Seconds',
      rawLookback: 60,
      rawMinIssueScore: 1,
    });
    expect(await screen.findByText(/3 created/)).toBeInTheDocument();
  });

  it('sends the per-Sensor calculation switch: the dialog default, overridden by a column', async () => {
    const posted = mockApi([]);
    const user = userEvent.setup();
    renderDialog();

    paste('externalSensorId,processingEnabled\na_1,\nb_1,true\nc_1,false');
    await setDefaults(user);
    await user.selectOptions(within(screen.getByRole('dialog')).getByRole('combobox', { name: 'Calculation' }), 'off');
    await user.click(await screen.findByRole('button', { name: 'Import 3 Sensor(s)' }));

    await waitFor(() => expect(posted).toHaveLength(3));
    // empty cell -> dialog default (off); explicit cells win.
    expect(posted.map((p) => p.body.processingEnabled)).toEqual([false, true, false]);
  });

  it('sends isCurve for a periodic Device', async () => {
    const posted = mockApi([]);
    const user = userEvent.setup();
    renderDialog('periodic');

    paste('externalSensorId\nx_1');
    await setDefaults(user);
    await user.click(await screen.findByRole('button', { name: 'Import 1 Sensor(s)' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body.isCurve).toBe(true);
  });

  it('sends nothing while any row has a problem, and names the line', async () => {
    const posted = mockApi([]);
    const user = userEvent.setup();
    renderDialog();

    paste('externalSensorId,direction\nok_1,lowerisbetter\nbad_1,sideways');
    await setDefaults(user);

    expect(await screen.findByText(/1 have problems/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Rows with problems' })).getByText(/Line 3 \(bad_1\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Import/ })).toBeDisabled();
    expect(posted).toHaveLength(0);
  });

  it('skips Sensors that already exist on the Device', async () => {
    const posted = mockApi([{ id: 1, externalSensorId: 'old_1' }]);
    const user = userEvent.setup();
    renderDialog();

    paste('externalSensorId\nold_1\nnew_1');
    await setDefaults(user);

    expect(await screen.findByText(/1 already exist and are skipped/)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Import 1 Sensor(s)' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body.externalSensorId).toBe('new_1');
  });

  it('reports a failed row, still creates the rest, and lists the failure with its line', async () => {
    const posted = mockApi([], (body) =>
      body.externalSensorId === 'bad_2'
        ? new Response(JSON.stringify('RawLookback must be greater than zero.'), { status: 400, headers: { 'content-type': 'application/json' } })
        : null,
    );
    const user = userEvent.setup();
    renderDialog();

    paste('externalSensorId\na_1\nbad_2\nc_3');
    await setDefaults(user);
    await user.click(await screen.findByRole('button', { name: 'Import 3 Sensor(s)' }));

    expect(await screen.findByText(/2 created, 1 failed/)).toBeInTheDocument();
    expect(posted.map((p) => p.body.externalSensorId)).toEqual(['a_1', 'c_3']);
    expect(within(screen.getByRole('list', { name: 'Failed rows' })).getByText(/Line 3 \(bad_2\)/)).toBeInTheDocument();
  });

  it('has no import action for an empty sheet', async () => {
    renderDialog();
    expect(await screen.findByRole('button', { name: 'Import' })).toBeDisabled();
  });
});
