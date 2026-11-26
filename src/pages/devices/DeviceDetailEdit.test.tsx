import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';
import { DeviceDetailPage } from './DeviceDetailPage';

vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const device = { id: 4, deviceName: 'Press 7', externalDeviceId: 'ext-4', applicationMode: 'continuous', enabled: true, timeZone: 'Europe/Budapest' };

/** The page asks for much more than the editor needs: everything else answers with an empty list. */
function mockApi(): { method: string; path: string; body: unknown }[] {
  const writes: { method: string; path: string; body: unknown }[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    if (request.method !== 'GET') {
      writes.push({ method: request.method, path, body: await request.clone().json() });
      return json(device);
    }
    if (path === '/api/Devices/4') return json(device);
    if (path === '/api/Devices/4/Sensors' || path === '/api/Servers' || path === '/api/Devices/4/Training') return json([]);
    return new Response(null, { status: 204 });
  });
  return writes;
}

function renderPage() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false }, mutations: { retry: false } } });
  render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/devices/4']}>
          <AppToastProvider>
            <Routes>
              <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
            </Routes>
          </AppToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('DeviceDetailPage: editing the Device', { timeout: 60_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('has Save and Close side by side in the header; Save only asks "are you sure" (no name to type)', async () => {
    const writes = mockApi();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }, { timeout: 10_000 }));

    const save = screen.getByRole('button', { name: 'Save' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(save.parentElement).toBe(close.parentElement);
    expect(screen.queryByRole('button', { name: 'Disable Device' })).toBeNull();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Press 8');
    await user.click(save);
    const dialog = (await screen.findByText('Are you sure you want to save the changes of this Device?', {}, { timeout: 10_000 })).closest<HTMLElement>('[role="dialog"]')!;
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(writes).toHaveLength(0);
    await user.click(within(dialog).getByText('Save').closest('button')!);
    await waitFor(() => expect(writes).toEqual([{ method: 'PUT', path: '/api/Devices/4', body: { deviceName: 'Press 8' } }]));
  });

  it('keeps the Enabled switch in the danger zone: switching off asks first', async () => {
    const writes = mockApi();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit' }, { timeout: 10_000 }));

    const zone = screen.getByRole('region', { name: 'Danger zone' });
    expect(within(zone).getByRole('button', { name: 'Delete device…' })).toBeInTheDocument();
    await user.click(within(zone).getByRole('switch', { name: 'Enabled' }));
    const dialog = (await screen.findByText('Disable this Device?', {}, { timeout: 10_000 })).closest<HTMLElement>('[role="dialog"]')!;
    expect(writes).toHaveLength(0);
    await user.click(within(dialog).getByText('Disable').closest('button')!);
    await waitFor(() => expect(writes).toEqual([{ method: 'PUT', path: '/api/Devices/4', body: { enabled: false } }]));
  });
});
