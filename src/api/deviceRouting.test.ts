import { describe, it, expect, beforeEach } from 'vitest';
import {
  baseUrlForDevice,
  baseUrlForHint,
  getHomeBaseUrl,
  isBlockedByMixedContent,
  reroute,
  routeBaseUrlFor,
  serverBaseUrl,
  setDeviceRoutes,
  setRoutingHintDevice,
  type DeviceRoute,
} from './deviceRouting';

const PLANT_A: DeviceRoute = { baseUrl: 'https://plant-a.example.test:8443', serverId: 7, serverName: 'Plant A' };
const home = () => getHomeBaseUrl();

beforeEach(() => {
  setDeviceRoutes(new Map());
  setRoutingHintDevice(undefined);
});

describe('serverBaseUrl', () => {
  it('builds the origin from the TLS flag, brackets IPv6 and adds the port only when given', () => {
    expect(serverBaseUrl({ address: 'a.example.test', useTls: true })).toBe('https://a.example.test');
    expect(serverBaseUrl({ address: '192.168.1.20', port: 8080, useTls: false })).toBe('http://192.168.1.20:8080');
    expect(serverBaseUrl({ address: 'fd00::1', port: 443, useTls: true })).toBe('https://[fd00::1]:443');
  });
});

describe('isBlockedByMixedContent', () => {
  it('blocks an http server only from an https page, and never a loopback one', () => {
    expect(isBlockedByMixedContent('http://192.168.1.20:8080', 'https:')).toBe(true);
    expect(isBlockedByMixedContent('http://plant.example.test', 'https:')).toBe(true);
    expect(isBlockedByMixedContent('https://plant.example.test', 'https:')).toBe(false);
    expect(isBlockedByMixedContent('http://localhost:5065', 'https:')).toBe(false);
    expect(isBlockedByMixedContent('http://192.168.1.20:8080', 'http:')).toBe(false);
  });
});

describe('routeBaseUrlFor', () => {
  it('changes nothing while no Device has a route', () => {
    expect(routeBaseUrlFor(`${home()}/api/Devices/5/Sensors`)).toBeUndefined();
  });

  it('routes a Device path and a deviceId query parameter to the Device\'s server, and nothing else', () => {
    setDeviceRoutes(new Map([[5, PLANT_A]]));
    expect(routeBaseUrlFor(`${home()}/api/Devices/5`)).toBe(PLANT_A.baseUrl);
    expect(routeBaseUrlFor(`${home()}/api/Devices/5/Sensors/3/Maintenance`)).toBe(PLANT_A.baseUrl);
    expect(routeBaseUrlFor(`${home()}/api/Continuous/MeasuredDateRange?deviceId=5&sensorId=2`)).toBe(PLANT_A.baseUrl);
    expect(routeBaseUrlFor(`${home()}/api/Issue?deviceId=5&take=50`)).toBe(PLANT_A.baseUrl);
    // another Device, the Device list, the registry, authentication and Company data stay home
    expect(routeBaseUrlFor(`${home()}/api/Devices/6/Sensors`)).toBeUndefined();
    expect(routeBaseUrlFor(`${home()}/api/Devices`)).toBeUndefined();
    expect(routeBaseUrlFor(`${home()}/api/Servers`)).toBeUndefined();
    expect(routeBaseUrlFor(`${home()}/api/Company`)).toBeUndefined();
    expect(routeBaseUrlFor(`${home()}/api/Authentication/Request_HMAC_Key`)).toBeUndefined();
  });

  it('does not mistake a Device id prefix for the Device (Devices/50 is not Device 5)', () => {
    setDeviceRoutes(new Map([[5, PLANT_A]]));
    expect(routeBaseUrlFor(`${home()}/api/Devices/50/Sensors`)).toBeUndefined();
  });

  it('sends an Issue-by-id request to the server of the selected Device, but only an Issue request', () => {
    setDeviceRoutes(new Map([[5, PLANT_A]]));
    expect(routeBaseUrlFor(`${home()}/api/Issue/12`)).toBeUndefined();
    setRoutingHintDevice(5);
    expect(routeBaseUrlFor(`${home()}/api/Issue/12`)).toBe(PLANT_A.baseUrl);
    expect(routeBaseUrlFor(`${home()}/api/Issue/12/Review`)).toBe(PLANT_A.baseUrl);
    expect(routeBaseUrlFor(`${home()}/api/IssueCategories`)).toBeUndefined();
    expect(routeBaseUrlFor(`${home()}/api/Company/Members`)).toBeUndefined();
  });

  it('lets a Device id in the URL win over the selected Device', () => {
    setDeviceRoutes(new Map([[5, PLANT_A]]));
    setRoutingHintDevice(5);
    expect(routeBaseUrlFor(`${home()}/api/Issue?deviceId=6`)).toBeUndefined();
  });
});

describe('baseUrlForDevice / baseUrlForHint', () => {
  it('is the home server unless the Device has a route', () => {
    setDeviceRoutes(new Map([[5, PLANT_A]]));
    expect(baseUrlForDevice(5)).toBe(PLANT_A.baseUrl);
    expect(baseUrlForDevice(6)).toBe(home());
    expect(baseUrlForDevice(undefined)).toBe(home());
    setRoutingHintDevice(5);
    expect(baseUrlForHint()).toBe(PLANT_A.baseUrl);
  });
});

describe('reroute', () => {
  it('keeps method, headers and body, changes only the origin', async () => {
    const request = new Request(`${home()}/api/Devices/5/Sensors?x=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test': 'yes' },
      body: JSON.stringify({ name: 'S' }),
    });
    const moved = await reroute(request, PLANT_A.baseUrl);
    expect(moved.url).toBe('https://plant-a.example.test:8443/api/Devices/5/Sensors?x=1');
    expect(moved.method).toBe('POST');
    expect(moved.headers.get('x-test')).toBe('yes');
    expect(await moved.json()).toEqual({ name: 'S' });
  });

  it('re-addresses a GET without a body', async () => {
    const moved = await reroute(new Request(`${home()}/api/Devices/5`), PLANT_A.baseUrl);
    expect(moved.url).toBe('https://plant-a.example.test:8443/api/Devices/5');
    expect(moved.method).toBe('GET');
  });
});
