import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';
import { MaintenancePage } from './MaintenancePage';

const auth = { isAdmin: true };
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth }));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const record = {
  id: 7, deviceId: 4, sensorId: 1, sensorName: 'Velocity Y', externalSensorId: 'v_y', startedAt: '2026-03-12T06:00:00Z', endedAt: '2026-03-12T14:20:00Z',
  kind: 'Replacement', manualBaseline: false, note: 'Balancing', baselineState: 'Active', warmUps: [],
};

function mockApi(inMaintenance: number) {
  const sensors = [1, 2].map((id) => ({ id, name: `Sensor ${id}`, externalSensorId: `s${id}`, maintenanceMode: id <= inMaintenance }));
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const path = new URL((input as Request).url).pathname;
    if (path === '/api/Devices/4') return json({ id: 4, deviceName: 'Press 7', externalDeviceId: 'ext-4' });
    if (path === '/api/Devices/4/Sensors') return json(sensors);
    if (path === '/api/Devices/4/Maintenances') return json({ deviceId: 4, total: 1, items: [record] });
    return json({});
  });
}

function renderPage() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false }, mutations: { retry: false } } });
  render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/devices/4/maintenance']}>
          <AppToastProvider>
            <Routes>
              <Route path="/devices/:deviceId/maintenance" element={<MaintenancePage />} />
            </Routes>
          </AppToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('MaintenancePage', { timeout: 40_000 }, () => {
  beforeEach(() => {
    authStore.clearSession();
    auth.isAdmin = true;
  });

  it('shows the state of the whole Device and its history; an Admin switches all Sensors from here', async () => {
    mockApi(0);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('0 of 2 Sensor(s) of this Device are in maintenance mode now.')).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Maintenance history' })).toBeInTheDocument();
    expect(screen.getByText('Balancing')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start maintenance on all Sensors' }));
    expect(await screen.findByText('Maintenance mode: all Sensors', {}, { timeout: 10_000 })).toBeInTheDocument();
  });

  it('names the button after what can be done', async () => {
    mockApi(1);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Start or end on all Sensors…' })).toBeInTheDocument();
  });

  it('shows a Reader the state and the history, and no control', async () => {
    auth.isAdmin = false;
    mockApi(2);
    renderPage();
    expect(await screen.findByText('2 of 2 Sensor(s) of this Device are in maintenance mode now.')).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Maintenance history' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /all Sensors/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Change kind|Start a new baseline/ })).toBeNull();
  });
});
