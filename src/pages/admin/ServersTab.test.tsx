import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PlatformServers, ServersTab } from './ServersTab';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { setLanguage } from '@/lib/language';
import { fetchMock } from '@/test/mockFetch';
import type { ServerDto } from '@/api/hooks/servers';

// ReplicationSection (inside every server card) asks who is signed in
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }));

const SERVER: ServerDto = {
  id: 7,
  name: 'Plant A',
  address: 'plant-a.example.test',
  port: 8443,
  useTls: true,
  enabled: true,
  deviceIdFrom: 1000,
  deviceIdTo: 1999,
  notes: 'LAN of plant A',
  createdAt: '2026-11-24T10:00:00Z',
  deviceCount: 0,
  isThisServer: true,
};

interface Recorded {
  method: string;
  path: string;
  body: unknown;
  hasKey: boolean;
}

function mockApi(servers: ServerDto[], overrides: Record<string, { status: number; body?: unknown }> = {}): Recorded[] {
  const calls: Recorded[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    const text = await request.clone().text();
    calls.push({ method: request.method, path, body: text ? JSON.parse(text) : undefined, hasKey: request.headers.has('HMAC_Key') });

    const answer =
      overrides[`${request.method} ${path}`] ??
      (request.method === 'GET' ? { status: 200, body: servers } : request.method === 'DELETE' ? { status: 204 } : { status: 200, body: SERVER });
    const isText = typeof answer.body === 'string';
    return new Response(answer.status === 204 ? null : isText ? (answer.body as string) : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': isText ? 'text/plain' : 'application/json' },
    });
  });
  return calls;
}

const PLATFORM_LIST = '/api/Platform/Companies/5/Servers';

function renderTab(platform = true) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          {platform ? <PlatformServers companyId={5} /> : <ServersTab />}
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

// The first Fluent dialog of a worker is slow to open when the whole suite runs in parallel: give these tests room instead of a flaky 5 s.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => setLanguage('en'));

describe('ServersTab', () => {
  it('lists the servers with address, range, Device count and the This server mark', async () => {
    mockApi([SERVER, { ...SERVER, id: 8, name: 'Plant B', address: '192.168.1.20', port: null, useTls: false, deviceIdFrom: null, deviceIdTo: null, notes: null, enabled: false, isThisServer: false, deviceCount: 2 }]);
    renderTab();

    expect(await screen.findByText('Plant A')).toBeInTheDocument();
    expect(screen.getByText('https://plant-a.example.test:8443')).toBeInTheDocument();
    expect(screen.getByText(/Device ids 1000 to 1999/)).toBeInTheDocument();
    expect(screen.getByText('This server')).toBeInTheDocument();
    expect(screen.getByText('LAN of plant A')).toBeInTheDocument();

    expect(screen.getByText('http://192.168.1.20')).toBeInTheDocument();
    expect(screen.getByText(/No reserved Device id range/)).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('cannot delete a server that has Devices, and says why', async () => {
    mockApi([{ ...SERVER, deviceCount: 3 }]);
    renderTab();

    expect(await screen.findByText('Plant A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete server' })).toBeDisabled();
    expect(screen.getByText('A server with Devices cannot be deleted - move its Devices to another server first.')).toBeInTheDocument();
  });

  it('adds a server: sends the typed values, authenticated, and refreshes the list', async () => {
    const calls = mockApi([]);
    const user = userEvent.setup();
    renderTab();

    expect(await screen.findByText('No servers registered yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a server' }));
    await user.type(screen.getByLabelText(/^Name/), '  Plant C ');
    await user.type(screen.getByLabelText(/^Address/), 'plant-c.example.test');
    await user.type(screen.getByLabelText('Port'), '8443');
    await user.type(screen.getByLabelText('First Device id'), '2000');
    await user.type(screen.getByLabelText('Last Device id'), '2999');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === PLATFORM_LIST)).toBe(true));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.hasKey).toBe(true);
    expect(post.body).toEqual({
      name: 'Plant C',
      address: 'plant-c.example.test',
      port: 8443,
      useTls: true,
      enabled: true,
      deviceIdFrom: 2000,
      deviceIdTo: 2999,
      notes: null,
    });
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET' && c.path === PLATFORM_LIST).length).toBeGreaterThan(1));
  });

  it('refuses a bad address before any request is made', async () => {
    const calls = mockApi([]);
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Add a server' }));
    await user.type(screen.getByLabelText(/^Name/), 'Plant C');
    await user.type(screen.getByLabelText(/^Address/), 'https://plant-c.example.test');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('The address must be a host name, DNS name, IPv4 or IPv6 address, without scheme, port or path.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it("shows the API's refusal of an overlapping range, in Hungarian with the name and numbers in place", async () => {
    mockApi([SERVER], { 'PUT /api/Platform/Companies/5/Servers/7': { status: 409, body: 'The Device id range overlaps the range of the server Plant B (2000-2999).' } });
    setLanguage('hu');
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Szerver szerkesztése' }));
    await user.click(screen.getByRole('button', { name: 'Mentés' }));

    expect(await screen.findByText('Az eszközazonosító-tartomány átfed a(z) Plant B szerver tartományával (2000–2999).')).toBeInTheDocument();
  });

  it('deletes after a confirmation', async () => {
    const calls = mockApi([SERVER]);
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole('button', { name: 'Delete server' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
    await user.click(within(dialog).getByRole('button', { name: 'Delete server' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === `${PLATFORM_LIST}/7`)).toBe(true));
  });

  it("shows a Company's own people the servers read-only: no add, edit or delete, and only the Company's own list is read", async () => {
    const calls = mockApi([{ ...SERVER, deviceCount: 3 }]);
    renderTab(false);

    expect(await screen.findByText('Plant A')).toBeInTheDocument();
    expect(screen.getByText('https://plant-a.example.test:8443')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a server' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit server' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete server' })).not.toBeInTheDocument();
    expect(screen.getByText(/registered by the platform administrator/)).toBeInTheDocument();
    expect(calls.every((c) => c.method === 'GET' && c.path === '/api/Servers')).toBe(true);
  });
});
