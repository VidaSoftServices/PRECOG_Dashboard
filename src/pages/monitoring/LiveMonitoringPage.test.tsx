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

function mockApi(sensors: unknown[]) {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const path = new URL((input as Request).url).pathname;
    // Two readings with a target, a tolerance and the server's control limits, for the card and for the enlarged chart.
    const reading = (period: number, measured: string) => ({
      sensorId: 1, period, measured, actual: 1.7,
      ...(reference === 'none' ? {} : { target: 2, tolerance: 0.05 }),
      ...(reference === 'full' ? { upperControlLimit3S: 1.99, upperControlLimit2S: 1.9, lowerControlLimit2S: 1.55, lowerControlLimit3S: 1.47 } : {}),
    });
    const body =
      path === '/api/Devices' ? [DEVICE]
      : path === '/api/Devices/4' ? DEVICE
      : path === '/api/Devices/4/Sensors' ? sensors
      : path === '/api/Continuous/MeasuredTrailingPeriods' ? [reading(1, '2026-10-21T10:00:00Z'), reading(2, '2026-10-21T10:00:05Z')]
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

  it('the enlarged chart explains why it has no Target, Tolerance or control limits when the platform has calculated none', async () => {
    reference = 'none';
    mockApi([sensor(1, 'RMS A', true)]);
    await openEnlarged();

    expect(await screen.findByText('No Target, Tolerance or control limits')).toBeInTheDocument();
    expect(screen.getByText(/whether it has a setpoint or not/)).toBeInTheDocument();
  });

  it('the enlarged chart says control limits are missing when the setpoint is there but the analysis has stored none', async () => {
    reference = 'targetOnly';
    mockApi([sensor(1, 'RMS A', true)]);
    await openEnlarged();

    expect(await screen.findByText('No control limits yet')).toBeInTheDocument();
    await waitFor(() => expect(drawn.labels[drawn.labels.length - 1]).toEqual(['RMS A Target', 'RMS A Tolerance', 'RMS A'])); // only what exists is drawn
  });

  it('shows no such notice when the platform has everything', async () => {
    mockApi([sensor(1, 'RMS A', true)]);
    await openEnlarged();

    await waitFor(() => expect(drawn.labels[drawn.labels.length - 1]).toContain('RMS A UCL3'));
    expect(screen.queryByText(/No control limits yet|No Target/)).not.toBeInTheDocument();
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
});
