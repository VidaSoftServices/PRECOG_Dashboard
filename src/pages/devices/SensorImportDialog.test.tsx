import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { SensorImportDialog } from './SensorImportDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';
import { CATALOG, CATALOG_DTO } from '@/test/sensorCatalog';

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

    // The unit / aggregation catalog comes from the API, like in production.
    if (request.method === 'GET') return request.url.includes('/api/SensorMetadata') ? json(CATALOG_DTO) : json(existing);
    const body = (await request.clone().json()) as Record<string, unknown>;
    const failure = failOn(body);
    if (failure) return failure;
    posted.push({ url: request.url, body });
    // Only a Sensor creation takes the next Device-scoped id; a setpoint POST does not.
    if (request.url.includes('/Setpoints')) return json({ id: 1, validFrom: body.validFrom }, 201);
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

  /** A sheet line for a known metric with its exact catalog metadata. */
  const knownLine = (machineName: string, overrides: { unitCode?: string; aggregationType?: string } = {}) => {
    const m = CATALOG.metrics.find((x) => x.machineName === machineName)!;
    const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return [`${machineName}_1`, quote(m.displayName), overrides.unitCode ?? m.unitCode, overrides.aggregationType ?? m.aggregationType, quote(m.aggregationExplanation)].join(',');
  };
  const KNOWN_HEADER = 'machineName,displayName,unitCode,aggregationType,aggregationExplanation';

  it('lists the allowed unit codes and aggregation types from the API catalog', async () => {
    mockApi([]);
    renderDialog();

    const allowed = await screen.findByTestId('allowed-values');
    for (const unit of CATALOG.units) expect(allowed).toHaveTextContent(`${unit.code} (${unit.label})`);
    for (const type of CATALOG.aggregationTypes) expect(allowed).toHaveTextContent(`${type.code} (${type.label})`);
  });

  it('shows the unit, aggregation type, explanation and validation state of every row in the preview', async () => {
    mockApi([]);
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId('allowed-values');

    paste([KNOWN_HEADER, knownLine('energy_1x_x_mean'), knownLine('velocity_rms_x_eq'), knownLine('shaft_rpm_mean')].join('\n'));
    await setDefaults(user);

    const preview = await screen.findByRole('table', { name: 'Preview of the first rows' });
    // The label AND the stable code: raw_energy stays raw_energy.
    expect(within(preview).getByText('Relative spectrum energy (raw_energy)')).toBeInTheDocument();
    expect(within(preview).getByText('mm/s (mm_s)')).toBeInTheDocument();
    expect(within(preview).getByText('RPM (rpm)')).toBeInTheDocument();
    expect(within(preview).getAllByText('Weighted mean (WEIGHTED_MEAN)')).toHaveLength(2);
    expect(within(preview).getByText('Equivalent RMS (EQUIVALENT_RMS)')).toBeInTheDocument();
    expect(within(preview).getAllByText('OK')).toHaveLength(3);
    // The explanation is shown (truncated in the cell, in full as its tooltip).
    expect(within(preview).getAllByTitle(/Do not use a simple arithmetic mean/)).toHaveLength(1);
  });

  it('sends unit, aggregation type and explanation to the API exactly as imported', async () => {
    const posted = mockApi([]);
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId('allowed-values');

    paste([KNOWN_HEADER, knownLine('band_1_2x_total_max')].join('\n'));
    await setDefaults(user);
    await user.click(await screen.findByRole('button', { name: 'Import 1 Sensor(s)' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    const metric = CATALOG.metrics.find((m) => m.machineName === 'band_1_2x_total_max')!;
    expect(posted[0]!.body).toMatchObject({
      externalSensorId: 'band_1_2x_total_max_1',
      unitCode: 'raw_energy',
      aggregationType: 'MAXIMUM',
      aggregationExplanation: metric.aggregationExplanation,
    });
  });

  it('blocks a known metric whose unit is missing or wrong and names the row and the field', async () => {
    const posted = mockApi([]);
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId('allowed-values');

    paste([KNOWN_HEADER, knownLine('velocity_rms_x_eq'), knownLine('energy_1x_x_mean', { unitCode: 'g' }), knownLine('shaft_rpm_mean', { aggregationType: '' })].join('\n'));
    await setDefaults(user);

    const problems = await screen.findByRole('list', { name: 'Rows with problems' });
    expect(within(problems).getByText(/Line 3 \(energy_1x_x_mean_1\).*\[unitCode = "g"\]/)).toBeInTheDocument();
    expect(within(problems).getByText(/Line 4 \(shaft_rpm_mean_1\).*\[aggregationType\]/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Import/ })).toBeDisabled();
    expect(posted).toHaveLength(0);
  });

  it('records target/tolerance as the first setpoint of the new Sensor, effective from the import, right after the Sensor', async () => {
    const posted = mockApi([]);
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId('allowed-values');

    paste(
      [
        'sensorName,direction,target,tolerance,targetAbove,targetBelow,toleranceAbove,toleranceBelow',
        'a_1,lowerisbetter,5,0.5,,,,',
        'b_1,lowerisbetter,,,,,,',
        'c_1,bidirectional,,,1500,1400,20,10',
      ].join('\n'),
    );
    await setDefaults(user);
    const before = Date.now();
    await user.click(await screen.findByRole('button', { name: 'Import 3 Sensor(s)' }));

    // 3 Sensors + 2 setpoints (the row without target/tolerance gets none).
    await waitFor(() => expect(posted).toHaveLength(5));
    const after = Date.now();
    expect(posted.map((p) => p.url.replace(/^.*\/api\//, ''))).toEqual([
      'Devices/4/Sensors',
      'Devices/4/Sensors/1/Setpoints',
      'Devices/4/Sensors',
      'Devices/4/Sensors',
      'Devices/4/Sensors/3/Setpoints',
    ]);
    expect(posted[1]!.body).toMatchObject({ target: 5, tolerance: 0.5 });
    expect(posted[1]!.body).not.toHaveProperty('targetAbove');
    expect(posted[4]!.body).toMatchObject({ targetAbove: 1500, targetBelow: 1400, toleranceAbove: 20, toleranceBelow: 10 });
    expect(posted[4]!.body).not.toHaveProperty('target');

    // Effective from the moment of the import - the same instant for every Sensor of the run, no open end.
    const validFrom = posted[1]!.body.validFrom as string;
    expect(validFrom).toBe(posted[4]!.body.validFrom);
    expect(new Date(validFrom).getTime()).toBeGreaterThanOrEqual(before - 1);
    expect(new Date(validFrom).getTime()).toBeLessThanOrEqual(after);
    expect(posted[1]!.body).not.toHaveProperty('validTo');
    expect(await screen.findByText(/2 setpoint\(s\) recorded/)).toBeInTheDocument();
  });

  it('a Sensor whose setpoint cannot be saved stays created, and the dialog says which setpoint failed', async () => {
    const posted = mockApi([], (body) => ('validFrom' in body ? new Response('Interval overlaps.', { status: 409 }) : null));
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId('allowed-values');

    paste(['sensorName,target', 'a_1,5', 'b_1,6'].join('\n'));
    await setDefaults(user);
    await user.click(await screen.findByRole('button', { name: 'Import 2 Sensor(s)' }));

    expect(await screen.findByText(/2 created/)).toBeInTheDocument();
    expect(await screen.findByText(/2 setpoint\(s\) could not be saved/)).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Setpoints not saved' });
    expect(within(list).getByText(/Line 2 \(a_1\)/)).toBeInTheDocument();
    expect(posted.filter((p) => p.url.endsWith('/Sensors'))).toHaveLength(2);
  });

  it('shows the setpoint in the preview and blocks a setpoint that does not fit the direction', async () => {
    const posted = mockApi([]);
    const user = userEvent.setup();
    renderDialog();
    await screen.findByTestId('allowed-values');

    paste(['sensorName,direction,target,tolerance,targetAbove', 'a_1,lowerisbetter,5,0.5,', 'b_1,bidirectional,,,10', 'c_1,bidirectional,7,,'].join('\n'));
    await setDefaults(user);

    const problems = await screen.findByRole('list', { name: 'Rows with problems' });
    expect(within(problems).getByText(/Line 4 \(c_1\).*\[target = "7"\]/)).toBeInTheDocument();
    const preview = screen.getByRole('table', { name: 'Preview of the first rows' });
    expect(within(preview).getByText('target 5 ± 0.5')).toBeInTheDocument();
    expect(within(preview).getByText('above 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Import/ })).toBeDisabled();
    expect(posted).toHaveLength(0);
  });

  it('offers the "Data sets" workbook once the catalog is loaded, as an .xlsx download', async () => {
    mockApi([]);
    const created: Blob[] = [];
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      created.push(blob as Blob);
      return 'blob:data-sets';
    };
    URL.revokeObjectURL = () => undefined;
    const clicked: string[] = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    };
    try {
      const user = userEvent.setup();
      renderDialog();
      await screen.findByTestId('allowed-values');

      await user.click(screen.getByRole('button', { name: 'Download Data sets' }));

      expect(clicked).toEqual(['sensor-import-data-sets.xlsx']);
      expect(created).toHaveLength(1);
      expect(created[0]!.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(created[0]!.size).toBeGreaterThan(20_000);
    } finally {
      HTMLAnchorElement.prototype.click = click;
    }
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
