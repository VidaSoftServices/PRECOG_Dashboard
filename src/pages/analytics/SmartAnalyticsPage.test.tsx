import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { SmartAnalyticsPage } from './SmartAnalyticsPage';
import { SelectedDeviceProvider } from '@/app/SelectedDeviceProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

// jsdom has no canvas: the chart's drawing is replaced by a stub that records the datasets it was given; the page's own text
// (title, summary, notices) is what is asserted.
const drawn = vi.hoisted(() => ({ labels: [] as string[][] }));
vi.mock('react-chartjs-2', () => ({
  Line: (props: { data: { datasets: { label?: string }[] } }) => {
    drawn.labels.push(props.data.datasets.map((d) => d.label ?? ''));
    return <canvas data-testid="chart-canvas" />;
  },
}));
const lastDrawn = () => drawn.labels[drawn.labels.length - 1] ?? [];

const DEVICES = [
  { id: 4, deviceName: 'Fan 1', externalDeviceId: 'fan1', applicationMode: 'continuous', enabled: true },
  { id: 5, deviceName: 'Fan 2', externalDeviceId: 'fan2', applicationMode: 'continuous', enabled: true },
];
const sensor = (id: number, name: string, visible?: boolean) => ({
  id, name, externalSensorId: `s${id}`, direction: 'lowerisbetter', enabled: true, processingEnabled: true, maintenanceMode: false, visible,
});

const rangeRequests: { deviceId: string | null; startDate: string | null; endDate: string | null; skip: string | null; take: string | null }[] = [];
/** When set, this Device (id as a string) returns full pages of readings, so a series reaches the load cap. */
let bulkFor: string | null = null;

function mockApi(sensorsByDevice: Record<number, unknown[]>, compatibility: unknown = { fullyCompatible: false, streams: [] }) {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const path = new URL((input as Request).url).pathname;
    const device = path.match(/^\/api\/Devices\/(\d+)$/);
    const sensors = path.match(/^\/api\/Devices\/(\d+)\/Sensors$/);
    let body: unknown = [];
    if (path === '/api/Devices') body = DEVICES;
    else if (device) body = DEVICES.find((d) => d.id === Number(device[1]));
    else if (sensors) body = sensorsByDevice[Number(sensors[1])] ?? [];
    else if (path === '/api/User/GetUserDetails') body = { isCompanyAdmin: true, hasAuthorizedCompany: true, userName: 'admin' };
    else if (path === '/api/KnowledgeSharing/Compatibility') body = compatibility;
    else if (path === '/api/Continuous/MeasuredDateRange') {
      // One reading per Device so each series has something to summarise: Device 4 reads 1.5 (with control limits), Device 5 reads 2.5.
      // Ranges are read in pages (skip/take): only the first page holds the reading, the next one is empty and ends the read.
      const query = new URL((input as Request).url).searchParams;
      rangeRequests.push({ deviceId: query.get('deviceId'), startDate: query.get('startDate'), endDate: query.get('endDate'), skip: query.get('skip'), take: query.get('take') });
      const deviceFour = query.get('deviceId') === '4';
      const skip = Number(query.get('skip') ?? 0);
      const take = Number(query.get('take') ?? 0);
      body = bulkFor === query.get('deviceId')
        ? Array.from({ length: take }, (_, i) => ({ sensorId: 1, period: skip + i, measured: new Date(Date.UTC(2026, 9, 21, 0, 0, 0) + (skip + i) * 1000).toISOString(), actual: 1 }))
        : skip > 0
          ? []
          : [{ sensorId: Number(query.get('sensorId')), period: 1, measured: '2026-10-21T10:00:00Z', actual: deviceFour ? 1.5 : 2.5, ...(deviceFour ? { target: 2, tolerance: 0.5, upperControlLimit3S: 4, upperControlLimit2S: 3, lowerControlLimit2S: 0, lowerControlLimit3S: -1 } : {}) }];
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

function renderPage(url: string) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppToastProvider>
            <MemoryRouter initialEntries={[url]}>
              <SelectedDeviceProvider>
                <SmartAnalyticsPage />
              </SelectedDeviceProvider>
            </MemoryRouter>
          </AppToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('SmartAnalyticsPage and hidden Sensors', { timeout: 40_000 }, () => {
  beforeEach(() => {
    authStore.clearSession();
    drawn.labels = [];
    rangeRequests.length = 0;
    bulkFor = null;
    // jsdom has no matchMedia (the page's breakpoint and chart hooks use it).
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it('single Device: offers only the Sensors that are not hidden, and says how many are hidden', async () => {
    mockApi({ 4: [sensor(1, 'RMS A', true), sensor(2, 'RMS B (hidden)', false), sensor(3, 'RMS C')] });
    renderPage('/analytics?deviceId=4');

    expect(await screen.findByRole('checkbox', { name: /RMS A/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /RMS C/ })).toBeInTheDocument(); // no flag at all = shown
    expect(screen.queryByRole('checkbox', { name: /RMS B \(hidden\)/ })).not.toBeInTheDocument();
    expect(screen.getByText(/2 Sensors/)).toHaveTextContent('(1 hidden on the Device page)');
  });

  it('single Device: never starts with a hidden Sensor selected, even when it is the first one', async () => {
    mockApi({ 4: [sensor(1, 'Hidden first', false), sensor(2, 'RMS B', true)] });
    renderPage('/analytics?deviceId=4');

    const shown = await screen.findByRole('checkbox', { name: /RMS B/ });
    expect(shown).toBeChecked(); // the default selection is the first SHOWN Sensor
    expect(screen.queryByRole('checkbox', { name: /Hidden first/ })).not.toBeInTheDocument();
  });

  it('single Device: says so when every Sensor is hidden, instead of claiming the Device has none', async () => {
    mockApi({ 4: [sensor(1, 'RMS A', false), sensor(2, 'RMS B', false)] });
    renderPage('/analytics?deviceId=4');

    expect(await screen.findByText('All Sensors of this Device are hidden')).toBeInTheDocument();
    expect(screen.queryByText('This Device has no Sensors yet')).not.toBeInTheDocument();
  });

  it('single Device: a Device without any Sensor still reports having none', async () => {
    mockApi({ 4: [] });
    renderPage('/analytics?deviceId=4');

    expect(await screen.findByText('This Device has no Sensors yet')).toBeInTheDocument();
  });

  it('two-Device comparison: neither Sensor picker offers a hidden Sensor', async () => {
    mockApi({
      4: [sensor(1, 'A visible', true), sensor(2, 'A hidden', false)],
      5: [sensor(11, 'B hidden', false), sensor(12, 'B visible')],
    });
    const user = userEvent.setup();
    renderPage('/analytics?deviceId=4&compareDeviceId=5');
    await user.click(await screen.findByRole('radio', { name: 'Compare Devices' }));

    const pickerA = await screen.findByRole('combobox', { name: 'Device A Sensor' });
    const pickerB = await screen.findByRole('combobox', { name: 'Device B Sensor' });
    expect(Array.from((pickerA as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['A visible']);
    expect(Array.from((pickerB as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['B visible']);
    expect((pickerB as HTMLSelectElement).value).toBe('12'); // the default is the first SHOWN Sensor of Device B, not its first Sensor
  });

  async function openComparison() {
    const user = userEvent.setup();
    renderPage('/analytics?deviceId=4&compareDeviceId=5');
    await user.click(await screen.findByRole('radio', { name: 'Compare Devices' }));
  }

  it('two-Device comparison: the two chosen Sensors share ONE chart, also when the API could not prove them compatible', async () => {
    mockApi({ 4: [sensor(1, 'Vibration X')], 5: [sensor(11, 'Vibration X')] }); // no compatibility streams at all = not proven
    await openComparison();

    // One chart (one Enlarge button, one drawing), named after both Sensors - not one panel per Device.
    expect(await screen.findAllByRole('button', { name: /Enlarge chart/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Enlarge chart: Fan 1 · Vibration X and Fan 2 · Vibration X' })).toBeInTheDocument();
    expect(screen.getAllByTestId('chart-canvas')).toHaveLength(1);
    // Both series are in that one chart (they are named Device · Sensor, so two Sensors with the same name stay apart).
    expect(await screen.findByText(/Fan 1 · Vibration X: latest 1\.5/)).toHaveTextContent('Fan 2 · Vibration X: latest 2.5');
    // The compatibility result stays visible as a notice - it no longer decides the layout.
    expect(screen.getByText('Not proven compatible')).toBeInTheDocument();
    expect(screen.getByText(/drawn in one chart as you selected them; the values are not converted or aligned/)).toBeInTheDocument();
  });

  it('single Device, one Sensor: draws the API\'s full reference set - Target, Tolerance, UCL3, UCL2, LCL2 and LCL3 - and Actual', async () => {
    mockApi({ 4: [sensor(1, 'RMS A', true)] });
    renderPage('/analytics?deviceId=4');

    await waitFor(() =>
      expect(lastDrawn()).toEqual(['RMS A Target', 'RMS A Tolerance', 'RMS A', 'RMS A UCL3', 'RMS A UCL2', 'RMS A LCL2', 'RMS A LCL3']),
    );
  });

  it('single Device, one Sensor the API has no limits for: the legend still lists the four limit lines, with no explanatory notice', async () => {
    mockApi({ 4: [sensor(1, 'RMS A', true)], 5: [sensor(1, 'RMS A', true)] });
    renderPage('/analytics?deviceId=5'); // Device 5's reading carries no target and no limits

    await waitFor(() => expect(lastDrawn()).toEqual(['RMS A', 'RMS A UCL3', 'RMS A UCL2', 'RMS A LCL2', 'RMS A LCL3']));
    expect(screen.queryByText(/No control limits|No Target/)).not.toBeInTheDocument();
  });

  it('single Device, several Sensors: a clean overlay without limit lines', async () => {
    mockApi({ 4: [sensor(1, 'RMS A', true), sensor(2, 'RMS B', true)] });
    const user = userEvent.setup();
    renderPage('/analytics?deviceId=4');
    await user.click(await screen.findByRole('checkbox', { name: /RMS B/ }));

    await waitFor(() => expect(lastDrawn()).toEqual(['RMS A', 'RMS B']));
  });

  it('opens on the last 15 minutes, and reads the range in pages (skip/take) instead of one request', async () => {
    mockApi({ 4: [sensor(1, 'Vibration X')] });
    renderPage('/analytics?deviceId=4');

    await waitFor(() => expect(rangeRequests.length).toBeGreaterThan(0));
    const first = rangeRequests[0]!;
    expect(Date.parse(first.endDate!) - Date.parse(first.startDate!)).toBe(15 * 60 * 1000);
    expect(Math.abs(Date.parse(first.endDate!) - Date.now())).toBeLessThan(60_000); // 15 minutes up to now
    // The first page starts at the beginning; the (empty) next one tells the read it is complete.
    expect(rangeRequests.map((r) => r.skip)).toEqual(['0', '1']);
    expect(first.take).toBe('5000');
  });

  it('two-Device comparison: each Sensor gets an average line, and the server\'s UCL3 / LCL3 where it has them', async () => {
    mockApi({ 4: [sensor(1, 'Vibration X')], 5: [sensor(11, 'Vibration X')] });
    await openComparison();

    expect(await screen.findByText(/Fan 1 · Vibration X: latest 1\.5/)).toHaveTextContent('average 1.5 over 1 points');
    expect(screen.getByText(/Fan 2 · Vibration X: latest 2\.5/)).toHaveTextContent('average 2.5 over 1 points');
    // Fan 1 has control limits (drawn, in its colour); Fan 2 has none (no empty legend entries).
    expect(lastDrawn()).toEqual(['Fan 1 · Vibration X UCL3', 'Fan 1 · Vibration X LCL3', 'Fan 1 · Vibration X average', 'Fan 1 · Vibration X', 'Fan 2 · Vibration X average', 'Fan 2 · Vibration X']);
    expect(screen.getByText(/dashed horizontal line of each Sensor is the average of the plotted readings/)).toBeInTheDocument();
  });

  it('says so when a series hit the load cap, because the oldest readings of the range are then left out', async () => {
    mockApi({ 4: [sensor(1, 'Vibration X')], 5: [sensor(11, 'Vibration X')] });
    bulkFor = '4'; // Fan 1 answers every page in full, so its series reaches the 20,000-point cap
    await openComparison();

    expect(await screen.findByText(/Newest 20,000 readings shown/)).toBeInTheDocument();
    expect(screen.getByText(/more readings of Fan 1 · Vibration X than one chart loads/)).toBeInTheDocument();
  });

  it('two-Device comparison: a proven-compatible pair is the same single chart, without the notice', async () => {
    mockApi({ 4: [sensor(1, 'Vibration X')], 5: [sensor(11, 'Vibration X')] }, { fullyCompatible: true, streams: [] });
    await openComparison();

    expect(await screen.findAllByRole('button', { name: /Enlarge chart/ })).toHaveLength(1);
    expect(screen.getAllByTestId('chart-canvas')).toHaveLength(1);
    expect(screen.queryByText('Not proven compatible')).not.toBeInTheDocument();
  });

  it('two-Device comparison: Sensors with different units still share one chart, and a notice says nothing is converted', async () => {
    mockApi({
      4: [{ ...sensor(1, 'Velocity'), unitCode: 'mm/s', unitLabel: 'mm/s' }],
      5: [{ ...sensor(11, 'Acceleration'), unitCode: 'g', unitLabel: 'g' }],
    });
    await openComparison();

    expect(await screen.findAllByRole('button', { name: /Enlarge chart/ })).toHaveLength(1);
    expect(screen.getAllByTestId('chart-canvas')).toHaveLength(1);
    const notice = screen.getByText('Different units').closest('[role="group"], div') as HTMLElement;
    expect(notice).toHaveTextContent('Fan 1 · Velocity is in mm/s, Fan 2 · Acceleration in g');
    expect(notice).toHaveTextContent('without conversion');
  });
});
