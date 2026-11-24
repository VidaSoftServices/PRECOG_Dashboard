import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DeviceRoutingGate } from './DeviceRoutingGate';
import * as authStore from '@/auth/authStore';
import { getHomeBaseUrl, setDeviceRoutes } from '@/api/deviceRouting';
import { setLanguage } from '@/lib/language';
import { fetchMock } from '@/test/mockFetch';

const home = () => new URL(getHomeBaseUrl()).origin;

function mockServers(servers: object[], devices: object[] = []) {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL((input as Request).url);
    if (url.origin === home() && url.pathname === '/api/Devices') return Response.json(devices);
    if (url.origin === home() && url.pathname === '/api/Servers') return Response.json(servers);
    throw new TypeError('Failed to fetch'); // every other server is down
  });
}

function renderGate() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 600_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <DeviceRoutingGate>
          <p>the page</p>
        </DeviceRoutingGate>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const PLANT_A = { id: 2, name: 'Plant A', address: 'plant-a.example.test', port: 8443, useTls: true, enabled: true, isThisServer: false, deviceCount: 0 };

beforeEach(() => {
  setLanguage('en');
  setDeviceRoutes(new Map());
});

describe('DeviceRoutingGate', () => {
  it('shows the page without any notice when there is only the home server', async () => {
    mockServers([]);
    renderGate();
    expect(await screen.findByText('the page')).toBeInTheDocument();
    expect(screen.queryByText('Some servers of your Company could not be read')).not.toBeInTheDocument();
  });

  it('names a server that could not be reached, and still shows the page', async () => {
    mockServers([PLANT_A]);
    renderGate();
    expect(await screen.findByText('Some servers of your Company could not be read')).toBeInTheDocument();
    expect(screen.getByText('Plant A: the server could not be reached. Its Devices are not shown.')).toBeInTheDocument();
    expect(screen.getByText('the page')).toBeInTheDocument();
  });

  it('says it in Hungarian too', async () => {
    setLanguage('hu');
    mockServers([PLANT_A]);
    renderGate();
    expect(await screen.findByText('Plant A: a szerver nem érhető el. Az eszközei nem láthatók.')).toBeInTheDocument();
  });
});
