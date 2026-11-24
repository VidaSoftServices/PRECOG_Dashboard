import { describe, it, expect, beforeEach } from 'vitest';
import { loadCompanyDevices } from './devices';
import { apiClient, ApiError } from '@/api/client';
import { getHomeBaseUrl, getUnreachableServers, routeForDevice, setDeviceRoutes, setRoutingHintDevice } from '@/api/deviceRouting';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const home = () => new URL(getHomeBaseUrl()).origin;
const A = 'https://plant-a.example.test:8443';
const B = 'https://plant-b.example.test';

const server = (id: number, name: string, address: string, port: number | null, extra: object = {}) => ({
  id,
  name,
  address,
  port,
  useTls: true,
  enabled: true,
  deviceIdFrom: null,
  deviceIdTo: null,
  notes: null,
  createdAt: '2026-11-24T10:00:00Z',
  deviceCount: 0,
  isThisServer: false,
  ...extra,
});
const device = (id: number, name: string, extra: object = {}) => ({ id, deviceName: name, externalDeviceId: `ext-${id}`, applicationMode: 'continuous', enabled: true, ...extra });

interface Seen {
  method: string;
  origin: string;
  path: string;
  hasKey: boolean;
}

/** Answers by origin + path; an origin missing from `answers` is unreachable (the fetch rejects). */
function mockServers(answers: Record<string, { status: number; body?: unknown }>): Seen[] {
  const seen: Seen[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const url = new URL(request.url);
    seen.push({ method: request.method, origin: url.origin, path: url.pathname, hasKey: request.headers.has('HMAC_Key') });
    const answer = answers[`${url.origin}${url.pathname}`];
    if (!answer) throw new TypeError('Failed to fetch');
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return seen;
}

beforeEach(() => {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 600_000).toISOString() });
  setDeviceRoutes(new Map());
  setRoutingHintDevice(undefined);
});

describe('loadCompanyDevices', () => {
  it('with no other server registered it is the home list only and routes nothing', async () => {
    const seen = mockServers({
      [`${home()}/api/Devices`]: { status: 200, body: [device(1, 'Home 1')] },
      [`${home()}/api/Servers`]: { status: 200, body: [server(1, 'Home', 'home.example.test', null, { isThisServer: true })] },
    });
    const devices = await loadCompanyDevices();
    expect(devices.map((d) => d.id)).toEqual([1]);
    expect(routeForDevice(1)).toBeUndefined();
    expect(seen.every((s) => s.origin === home())).toBe(true);
  });

  it('adds the Devices of another server, tagged with its name, and routes them there with the same token', async () => {
    const seen = mockServers({
      [`${home()}/api/Devices`]: { status: 200, body: [device(1, 'Home 1')] },
      [`${home()}/api/Servers`]: {
        status: 200,
        body: [server(1, 'Home', 'home.example.test', null, { isThisServer: true }), server(2, 'Plant A', 'plant-a.example.test', 8443)],
      },
      [`${A}/api/Devices`]: { status: 200, body: [device(1001, 'Plant A 1'), device(1002, 'Plant A 2')] },
    });
    const devices = await loadCompanyDevices();

    expect(devices.map((d) => d.id)).toEqual([1, 1001, 1002]);
    expect(devices.find((d) => d.id === 1001)).toMatchObject({ serverId: 2, serverName: 'Plant A' });
    expect(routeForDevice(1001)?.baseUrl).toBe(A);
    expect(routeForDevice(1)).toBeUndefined();
    expect(getUnreachableServers()).toEqual([]);
    expect(seen.find((s) => s.origin === A)?.hasKey).toBe(true);
  });

  it('a server that is down does not fail the list: the others show and it is reported', async () => {
    mockServers({
      [`${home()}/api/Devices`]: { status: 200, body: [device(1, 'Home 1')] },
      [`${home()}/api/Servers`]: { status: 200, body: [server(2, 'Plant A', 'plant-a.example.test', 8443), server(3, 'Plant B', 'plant-b.example.test', null)] },
      [`${B}/api/Devices`]: { status: 200, body: [device(2001, 'Plant B 1')] },
      // Plant A has no answer: the fetch rejects
    });
    const devices = await loadCompanyDevices();
    expect(devices.map((d) => d.id)).toEqual([1, 2001]);
    expect(getUnreachableServers()).toEqual([{ serverId: 2, serverName: 'Plant A', reason: 'down' }]);
  });

  it('a server that refuses the sign-in is reported as refused and does not raise the sign-in dialog', async () => {
    mockServers({
      [`${home()}/api/Devices`]: { status: 200, body: [] },
      [`${home()}/api/Servers`]: { status: 200, body: [server(2, 'Plant A', 'plant-a.example.test', 8443)] },
      [`${A}/api/Devices`]: { status: 401, body: 'Unauthorized' },
    });
    await loadCompanyDevices();
    expect(getUnreachableServers()).toEqual([{ serverId: 2, serverName: 'Plant A', reason: 'refused' }]);
    expect(authStore.isReauthRequired()).toBe(false);
  });

  it('skips a disabled server, and an old API without the registry means the home server only', async () => {
    mockServers({
      [`${home()}/api/Devices`]: { status: 200, body: [device(1, 'Home 1')] },
      [`${home()}/api/Servers`]: { status: 200, body: [server(2, 'Plant A', 'plant-a.example.test', 8443, { enabled: false })] },
    });
    expect((await loadCompanyDevices()).map((d) => d.id)).toEqual([1]);

    mockServers({
      [`${home()}/api/Devices`]: { status: 200, body: [device(1, 'Home 1')] },
      [`${home()}/api/Servers`]: { status: 404, body: 'Not found' },
    });
    expect((await loadCompanyDevices()).map((d) => d.id)).toEqual([1]);
  });

  it("a home row pointing at a server routes there, and the server's own row replaces the pointer", async () => {
    mockServers({
      [`${home()}/api/Devices`]: { status: 200, body: [device(1001, 'pointer', { serverId: 2 })] },
      [`${home()}/api/Servers`]: { status: 200, body: [server(2, 'Plant A', 'plant-a.example.test', 8443)] },
      [`${A}/api/Devices`]: { status: 200, body: [device(1001, 'the real one')] },
    });
    const devices = await loadCompanyDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]?.deviceName).toBe('the real one');
    expect(routeForDevice(1001)?.baseUrl).toBe(A);
  });
});

describe('the API client with a route', () => {
  it("sends a Device's request to its server with the token, and keeps the home server for everything else", async () => {
    setDeviceRoutes(new Map([[1001, { baseUrl: A, serverId: 2, serverName: 'Plant A' }]]));
    const seen = mockServers({
      [`${A}/api/Devices/1001`]: { status: 200, body: device(1001, 'Plant A 1') },
      [`${home()}/api/Company`]: { status: 200, body: {} },
    });
    await apiClient.GET('/api/Devices/{deviceId}', { params: { path: { deviceId: 1001 } } });
    await apiClient.GET('/api/Company');

    expect(seen[0]).toMatchObject({ origin: A, path: '/api/Devices/1001', hasKey: true });
    expect(seen[1]).toMatchObject({ origin: home(), path: '/api/Company', hasKey: true });
  });

  it('a 401 from another server explains itself and does not sign the person out, while the access is still valid', async () => {
    setDeviceRoutes(new Map([[1001, { baseUrl: A, serverId: 2, serverName: 'Plant A' }]]));
    mockServers({ [`${A}/api/Devices/1001`]: { status: 401, body: 'Unauthorized' } });

    const failure = await apiClient.GET('/api/Devices/{deviceId}', { params: { path: { deviceId: 1001 } } }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(401);
    expect((failure as ApiError).message).toMatch(/did not accept your sign-in/);
    expect(authStore.isReauthRequired()).toBe(false);
  });

  it('a 401 from the home server still opens the sign-in dialog', async () => {
    mockServers({ [`${home()}/api/Company`]: { status: 401, body: 'Unauthorized' } });
    await apiClient.GET('/api/Company').catch(() => undefined);
    expect(authStore.isReauthRequired()).toBe(true);
  });
});
