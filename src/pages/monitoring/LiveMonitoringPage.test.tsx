import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { LiveMonitoringPage } from './LiveMonitoringPage';
import { SelectedDeviceProvider } from '@/app/SelectedDeviceProvider';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

// jsdom has no canvas: the chart's drawing is replaced by a stub that records the datasets it was given.
const drawn = vi.hoisted(() => ({ labels: [] as string[][] }));
vi.mock('react-chartjs-2', () => ({
  Line: (props: { data: { datasets: { label?: string }[] } }) => {
    drawn.labels.push(props.data.datasets.map((d) => d.label ?? ''));
    return <canvas data-testid="chart-canvas" />;
  },
}));

/** What the platform has calculated for the readings the mock returns: everything, only the setpoint's target, or nothing. */
let reference: 'full' | 'targetOnly' | 'none' = 'full';

const DEVICE = { id: 4, deviceName: 'Fan 1', externalDeviceId: 'fan1', applicationMode: 'continuous', enabled: true };
const sensor = (id: number, name: string, visible?: boolean) => ({
  id, name, externalSensorId: `s${id}`, direction: 'lowerisbetter', enabled: true, processingEnabled: true, maintenanceMode: false, visible,
});

/** Every request the page made to the API: its path and its query string, in order. */
const requests: { path: string; search: URLSearchParams }[] = [];

function mockApi(sensors: unknown[]) {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL((input as Request).url);
    const path = url.pathname;
    requests.push({ path, search: url.searchParams });
    // Two readings with a target, a tolerance and the server's control limits, for the card and for the enlarged chart. The API returns
    // them NEWEST FIRST (the older reading reads 1.7, the newest 1.8).
    const reading = (sensorId: number, period: number, measured: string, actual: number) => ({
      sensorId, period, measured, actual,
      ...(reference === 'none' ? {} : { target: 2, tolerance: 0.05 }),
      ...(reference === 'full' ? { upperControlLimit3S: 1.99, upperControlLimit2S: 1.9, lowerControlLimit2S: 1.55, lowerControlLimit3S: 1.47 } : {}),
    });
    const newestFirst = (sensorId: number) => [reading(sensorId, 2, '2026-10-21T10:00:05Z', 1.8), reading(sensorId, 1, '2026-10-21T10:00:00Z', 1.7)];
    const body =
      path === '/api/Devices' ? [DEVICE]
      : path === '/api/Devices/4' ? DEVICE
      : path === '/api/Devices/4/Sensors' ? sensors
      // ONE request for every Sensor on screen: a flat list, every row carries its sensorId.
      : path === '/api/Continuous/MeasuredTrailingPeriodsBatch' ? url.searchParams.getAll('sensorIds').flatMap((id) => newestFirst(Number(id)))
      : [];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}

function renderPage() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <MemoryRouter initialEntries={['/monitoring?deviceId=4']}>
            <SelectedDeviceProvider>
              <LiveMonitoringPage />
            </SelectedDeviceProvider>
          </MemoryRouter>
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('LiveMonitoringPage and hidden Sensors', { timeout: 30_000 }, () => {
  beforeEach(() => {
    authStore.clearSession();
    drawn.labels = [];
    requests.length = 0;
    reference = 'full';
    // jsdom has no matchMedia (the page's breakpoint and chart hooks use it).
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it('shows a card only for the Sensors that are not hidden, and says how many are hidden', async () => {
    mockApi([sensor(1, 'RMS A', true), sensor(2, 'RMS B (hidden)', false), sensor(3, 'RMS C')]);
    renderPage();

    expect((await screen.findAllByText('RMS A')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('RMS C')).length).toBeGreaterThan(0); // no flag at all = shown
    expect(screen.queryByText('RMS B (hidden)')).not.toBeInTheDocument();
    const status = screen.getByText(/Showing 1–2 of 2 Sensors/);
    expect(status).toHaveTextContent('1 hidden Sensor(s) not listed');
    // The refresh controls exist only for the Sensors that are listed.
    expect(screen.queryByRole('button', { name: 'Refresh RMS B (hidden)' })).not.toBeInTheDocument();
  });

  it('the enlarged chart draws Target, Tolerance and UCL3 / UCL2 / LCL2 / LCL3 like the original app - the small card keeps its plain chart', async () => {
    mockApi([sensor(1, 'RMS A', true)]); // lower is better
    const user = userEvent.setup();
    renderPage();

    // The card's own chart: only the target and the measured line (no tolerance, no 2-sigma limits, no bands).
    await waitFor(() => expect(drawn.labels.some((l) => l.join() === 'RMS A Target,RMS A')).toBe(true));

    await user.click(await screen.findByRole('button', { name: 'Enlarge chart of RMS A' }));

    await waitFor(() =>
      expect(drawn.labels[drawn.labels.length - 1]).toEqual([
        'RMS A Target', 'RMS A Tolerance', 'RMS A', 'RMS A UCL3', 'RMS A UCL2', 'RMS A LCL2', 'RMS A LCL3',
      ]),
    );
  });

  async function openEnlarged() {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Enlarge chart of RMS A' }));
  }

  it('the enlarged chart always lists the four limit lines in its legend, draws only the values the API has, and shows no explanatory notice', async () => {
    reference = 'none';
    mockApi([sensor(1, 'RMS A', true)]);
    await openEnlarged();

    // No target, no tolerance, no limit value: the readings, and the limit lines named in the legend (nothing is drawn for them).
    await waitFor(() => expect(drawn.labels[drawn.labels.length - 1]).toEqual(['RMS A', 'RMS A UCL3', 'RMS A UCL2', 'RMS A LCL2', 'RMS A LCL3']));
    expect(screen.queryByText(/No control limits yet|No Target|setpoint/)).not.toBeInTheDocument();
  });

  it('draws Target and Tolerance but no limit values when the API has stored no control limits, again without a notice (the legend still names them)', async () => {
    reference = 'targetOnly';
    mockApi([sensor(1, 'RMS A', true)]);
    await openEnlarged();

    await waitFor(() =>
      expect(drawn.labels[drawn.labels.length - 1]).toEqual(['RMS A Target', 'RMS A Tolerance', 'RMS A', 'RMS A UCL3', 'RMS A UCL2', 'RMS A LCL2', 'RMS A LCL3']),
    );
    expect(screen.queryByText(/No control limits yet|No Target|setpoint/)).not.toBeInTheDocument();
  });

  it('draws UCL3, UCL2, LCL2 and LCL3 as soon as the API returns them', async () => {
    mockApi([sensor(1, 'RMS A', true)]);
    await openEnlarged();

    await waitFor(() =>
      expect(drawn.labels[drawn.labels.length - 1]).toEqual(['RMS A Target', 'RMS A Tolerance', 'RMS A', 'RMS A UCL3', 'RMS A UCL2', 'RMS A LCL2', 'RMS A LCL3']),
    );
  });

  it('says so when every Sensor of the Device is hidden, instead of showing an empty page', async () => {
    mockApi([sensor(1, 'RMS A', false), sensor(2, 'RMS B', false)]);
    renderPage();

    expect(await screen.findByText('All Sensors of this Device are hidden')).toBeInTheDocument();
    expect(screen.getByText(/show them again with the Visible switch/)).toBeInTheDocument();
    expect(screen.queryByText('RMS A')).not.toBeInTheDocument();
    expect(screen.queryByText('No sensors on this Device')).not.toBeInTheDocument();
  });

  it('still reports a Device without any Sensor as having none', async () => {
    mockApi([]);
    renderPage();

    expect(await screen.findByText('No sensors on this Device')).toBeInTheDocument();
  });

  it('does not show the page title on screen, but keeps it as the page heading for assistive technology', async () => {
    mockApi([sensor(1, 'RMS A', true)]);
    const { container } = renderPage();

    await screen.findByText(/Current operational state/); // the description and the rest of the page are there
    expect(container.querySelector('.fui-Title2')).toBeNull(); // no visible title
    expect(screen.getByRole('heading', { level: 1, name: 'Live Monitoring' })).toBeInTheDocument(); // still the h1
  });

  it('refreshes EVERY Sensor on screen with ONE batched request (the Sensors as a parameter), never one request per Sensor', async () => {
    mockApi([sensor(1, 'RMS A', true), sensor(2, 'RMS B', true), sensor(3, 'RMS C', true)]);
    renderPage();

    await waitFor(() => expect(requests.filter((r) => r.path === '/api/Continuous/MeasuredTrailingPeriodsBatch')).toHaveLength(1));
    const batch = requests.find((r) => r.path === '/api/Continuous/MeasuredTrailingPeriodsBatch')!;
    expect(batch.search.getAll('sensorIds')).toEqual(['1', '2', '3']);
    expect(batch.search.get('deviceId')).toBe('4');
    expect(batch.search.get('periods')).toBe('20');
    expect(requests.some((r) => r.path === '/api/Continuous/MeasuredTrailingPeriods')).toBe(false); // no per-Sensor request
  });

  it("a card shows the NEWEST reading as its latest one (the API returns the readings newest first)", async () => {
    mockApi([sensor(1, 'RMS A', true)]);
    renderPage();

    expect(await screen.findByText('1.8')).toBeInTheDocument(); // not 1.7, the older of the two
    expect(screen.queryByText('1.7')).not.toBeInTheDocument();
  });

  it('the switch says the Sensors refresh every 5 seconds, and the note explains the one request', async () => {
    mockApi([sensor(1, 'RMS A', true)]);
    renderPage();

    expect(await screen.findByRole('switch', { name: 'Refresh every 5 seconds' })).toBeChecked();
    expect(screen.getByText(/all of them together, in one request every 5 s/)).toBeInTheDocument();
  });

  it('the circular arrow of a card refreshes just that Sensor with one request for it', async () => {
    mockApi([sensor(1, 'RMS A', true), sensor(2, 'RMS B', true)]);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(requests.filter((r) => r.path === '/api/Continuous/MeasuredTrailingPeriodsBatch')).toHaveLength(1));
    requests.length = 0;

    await user.click(await screen.findByRole('button', { name: 'Refresh RMS B' }));

    await waitFor(() => expect(requests.filter((r) => r.path === '/api/Continuous/MeasuredTrailingPeriodsBatch')).toHaveLength(1));
    expect(requests.find((r) => r.path === '/api/Continuous/MeasuredTrailingPeriodsBatch')!.search.getAll('sensorIds')).toEqual(['2']);
  });
});
