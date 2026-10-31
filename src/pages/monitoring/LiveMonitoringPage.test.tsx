import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { LiveMonitoringPage } from './LiveMonitoringPage';
import { SelectedDeviceProvider } from '@/app/SelectedDeviceProvider';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const DEVICE = { id: 4, deviceName: 'Fan 1', externalDeviceId: 'fan1', applicationMode: 'continuous', enabled: true };
const sensor = (id: number, name: string, visible?: boolean) => ({
  id, name, externalSensorId: `s${id}`, direction: 'lowerisbetter', enabled: true, processingEnabled: true, maintenanceMode: false, visible,
});

function mockApi(sensors: unknown[]) {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const path = new URL((input as Request).url).pathname;
    const body = path === '/api/Devices' ? [DEVICE] : path === '/api/Devices/4' ? DEVICE : path === '/api/Devices/4/Sensors' ? sensors : [];
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
