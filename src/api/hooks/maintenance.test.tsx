import { describe, it, expect, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { useSetSensorMaintenance } from './maintenance';
import { MaintenancePill } from '@/components/StatusPill';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useSetSensorMaintenance', () => {
  beforeEach(() => {
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  });

  it('PUTs only { enabled } to the Sensor maintenance route - never a MAC address', async () => {
    fetchMock().mockImplementation(
      async () =>
        new Response(JSON.stringify({ deviceId: 2, sensorId: 3, maintenanceMode: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const { result } = renderHook(() => useSetSensorMaintenance(2, 3), { wrapper });
    result.current.mutate(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const request = fetchMock().mock.calls.at(-1)![0] as Request;
    expect(request.method).toBe('PUT');
    expect(request.url).toContain('/api/Devices/2/Sensors/3/Maintenance');
    expect(await request.clone().json()).toEqual({ enabled: true });
  });

  it('surfaces the server\'s Admin-only refusal as an error instead of swallowing it', async () => {
    fetchMock().mockImplementation(
      async () =>
        new Response(JSON.stringify('You need admin privileges to set maintenance mode.'), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const { result } = renderHook(() => useSetSensorMaintenance(2, 3), { wrapper });
    result.current.mutate(true);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { status?: number }).status).toBe(403);
  });
});

describe('MaintenancePill', () => {
  function renderPill(maintenanceMode: boolean | undefined) {
    return render(
      <FluentProvider theme={webLightTheme}>
        <MaintenancePill maintenanceMode={maintenanceMode} />
      </FluentProvider>,
    );
  }

  it('shows a labelled badge for a Sensor in maintenance', () => {
    renderPill(true);
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  });

  it.each([false, undefined])('renders nothing when maintenance mode is %s', (value) => {
    renderPill(value);
    expect(screen.queryByText('Maintenance')).not.toBeInTheDocument();
  });
});
