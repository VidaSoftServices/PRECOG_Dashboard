/**
 * Routing of Device requests between the Company's servers (slice S7).
 *
 * A Company may run several PRECOG servers, each with its own database. The person signs in once, on the home server (the
 * one VITE_API_BASE_URL names); the same user with the same password hash exists on the other servers, which share the home
 * server's HMAC key, so the SAME token is accepted by all of them. This module only decides WHICH server a request goes to:
 *
 *   - a request that names a Device (path `/api/Devices/{id}...` or a `deviceId` query parameter) goes to that Device's server;
 *   - an Issue-by-id request (`/api/Issue/{id}...`, no Device in the URL) goes to the server of the selected Device (the Issue
 *     pages are reached from a Device's Issue list; the page verifies the loaded Issue really belongs to that server);
 *   - everything else (Company, Users, servers registry, authentication, reference data) goes to the home server.
 *
 * With no routes registered (a Company with one server, or none registered) nothing is rewritten: the behaviour is exactly the
 * one it was before. Framework-agnostic on purpose (the API client must not import React); `DeviceRoutingSync` feeds it.
 */

/** The server a Device lives on, as the Dashboard can reach it. */
export interface DeviceRoute {
  /** `scheme://host[:port]` without a trailing slash. */
  baseUrl: string;
  serverId: number;
  serverName: string;
}

const homeBaseUrl = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '');

/** A server of the Company the Dashboard could not read the Devices of (down, refusing the sign-in, or blocked by the browser). */
export interface UnreachableServer {
  serverId: number;
  serverName: string;
  /** `blocked` = an http address from an https page; `refused` = the server did not accept the sign-in; `down` = anything else. */
  reason: 'blocked' | 'refused' | 'down';
}

let routes = new Map<number, DeviceRoute>();
let unreachable: readonly UnreachableServer[] = [];
let hintDeviceId: number | undefined;
const listeners = new Set<() => void>();

export function getHomeBaseUrl(): string {
  return homeBaseUrl;
}

/** Replaces the whole routing table (only Devices that live on ANOTHER, reachable server belong in it). */
export function setDeviceRoutes(next: ReadonlyMap<number, DeviceRoute>): void {
  routes = new Map(next);
  for (const listener of listeners) listener();
}

export function setUnreachableServers(next: readonly UnreachableServer[]): void {
  unreachable = next;
  for (const listener of listeners) listener();
}

export function getUnreachableServers(): readonly UnreachableServer[] {
  return unreachable;
}

/** The Device the person is working with: the target of requests that carry no Device id themselves (Issue by id). */
export function setRoutingHintDevice(deviceId: number | undefined): void {
  hintDeviceId = deviceId;
}

export function subscribeRouting(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The route of a Device on another server, or undefined when it is on the home server (or unknown). */
export function routeForDevice(deviceId: number | undefined): DeviceRoute | undefined {
  return deviceId === undefined ? undefined : routes.get(deviceId);
}

/** The base URL a Device's requests go to (the home server's when the Device has no route). */
export function baseUrlForDevice(deviceId: number | undefined): string {
  return routeForDevice(deviceId)?.baseUrl ?? homeBaseUrl;
}

/** The base URL requests without a Device id of their own go to (that of the selected Device). */
export function baseUrlForHint(): string {
  return baseUrlForDevice(hintDeviceId);
}

/** `scheme://host[:port]` of a registered server, for the browser to call. */
export function serverBaseUrl(server: { address: string; port?: number | null; useTls: boolean }): string {
  const host = server.address.includes(':') ? `[${server.address}]` : server.address;
  return `${server.useTls ? 'https' : 'http'}://${host}${server.port ? `:${server.port}` : ''}`;
}

/**
 * True when a browser page served over https may NOT call this server: an https page cannot call an http address (mixed content)
 * - except a loopback one, which browsers treat as secure.
 */
export function isBlockedByMixedContent(baseUrl: string, pageProtocol: string = typeof window === 'undefined' ? 'http:' : window.location.protocol): boolean {
  if (pageProtocol !== 'https:' || !baseUrl.startsWith('http://')) return false;
  const host = new URL(baseUrl).hostname;
  return !(host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1');
}

const DEVICE_PATH = /^\/api\/Devices\/(\d+)(?:\/|$)/i;
const ISSUE_PATH = /^\/api\/Issue\/\d+/i;

/**
 * The base URL a request should go to, or undefined when it stays on the home server. `url` is the full request URL.
 * A Device id in the URL always wins over the hint.
 */
export function routeBaseUrlFor(url: string): string | undefined {
  if (routes.size === 0) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!parsed.pathname.startsWith('/api/')) return undefined;
  const path = DEVICE_PATH.exec(parsed.pathname);
  const fromQuery = parsed.searchParams.get('deviceId');
  const id = path ? Number(path[1]) : fromQuery !== null && /^\d+$/.test(fromQuery) ? Number(fromQuery) : undefined;
  let target: string | undefined;
  if (id !== undefined) target = routes.get(id)?.baseUrl;
  else if (ISSUE_PATH.test(parsed.pathname)) target = routes.get(hintDeviceId ?? -1)?.baseUrl;
  return target && target !== homeBaseUrl ? target : undefined;
}

/**
 * Re-addresses a request to another server's origin, keeping the method, headers, body and abort signal. The body is read
 * into memory first (a Request built from another Request would otherwise need a streaming `duplex` option).
 */
export async function reroute(request: Request, baseUrl: string): Promise<Request> {
  const original = new URL(request.url);
  const target = new URL(baseUrl);
  const url = `${target.origin}${original.pathname}${original.search}`;
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.clone().arrayBuffer() : undefined;
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: body && body.byteLength > 0 ? body : undefined,
    signal: request.signal,
    cache: request.cache,
    credentials: request.credentials,
    redirect: request.redirect,
  });
}
