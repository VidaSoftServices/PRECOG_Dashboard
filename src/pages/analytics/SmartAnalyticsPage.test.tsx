import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const DEVICES = [
  { id: 4, deviceName: 'Fan 1', externalDeviceId: 'fan1', applicationMode: 'continuous', enabled: true },
  { id: 5, deviceName: 'Fan 2', externalDeviceId: 'fan2', applicationMode: 'continuous', enabled: true },
];
const sensor = (id: number, name: string, visible?: boolean) => ({
  id, name, externalSensorId: `s${id}`, direction: 'lowerisbetter', enabled: true, processingEnabled: true, maintenanceMode: false, visible,
});

function mockApi(sensorsByDevice: Record<number, unknown[]>) {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const path = new URL((input as Request).url).pathname;
    const device = path.match(/^\/api\/Devices\/(\d+)$/);
    const sensors = path.match(/^\/api\/Devices\/(\d+)\/Sensors$/);
    let body: unknown = [];
    if (path === '/api/Devices') body = DEVICES;
    else if (device) body = DEVICES.find((d) => d.id === Number(device[1]));
    else if (sensors) body = sensorsByDevice[Number(sensors[1])] ?? [];
    else if (path === '/api/User/GetUserDetails') body = { isCompanyAdmin: true, hasAuthorizedCompany: true, userName: 'admin' };
    else if (path === '/api/KnowledgeSharing/Compatibility') body = { fullyCompatible: false, streams: [] };
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
});
