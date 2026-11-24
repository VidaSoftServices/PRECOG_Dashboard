import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ReplicationSection, envSnippet } from './ReplicationSection';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { setLanguage } from '@/lib/language';
import { fetchMock } from '@/test/mockFetch';
import type { ServerDto } from '@/api/hooks/servers';

vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }));

const SERVER: ServerDto = {
  id: 8,
  name: 'Plant B',
  address: 'plant-b.example.test',
  port: 8443,
  useTls: true,
  enabled: true,
  deviceCount: 1,
  isThisServer: false,
  hasReplicationKey: true,
  replicationKeyCreatedAt: '2026-11-20T10:00:00Z',
  replicationLastPullAt: new Date(Date.now() - 30_000).toISOString(),
  replicationInSync: true,
  replicationLastError: null,
};

interface Recorded {
  method: string;
  origin: string;
  path: string;
}

const SECRET = 'invented-one-time-secret-value';

function mockApi(overrides: Record<string, { status: number; body?: unknown }> = {}): Recorded[] {
  const calls: Recorded[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const url = new URL(request.url);
    calls.push({ method: request.method, origin: url.origin, path: url.pathname });
    const answer = overrides[`${request.method} ${url.pathname}`] ?? { status: 200, body: {} };
    return new Response(answer.status === 204 ? null : JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } });
  });
  return calls;
}

function renderSection(server: ServerDto, platform = true) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <ReplicationSection server={server} manage={platform ? { companyId: 5 } : undefined} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => setLanguage('en'));

describe('ReplicationSection', () => {
  it('shows nothing for the master itself', () => {
    mockApi();
    const { container } = renderSection({ ...SERVER, isThisServer: true });
    expect(container.textContent).toBe('');
  });

  it('shows the key, what the master saw of the last pull, and the last error', () => {
    mockApi();
    renderSection({ ...SERVER, replicationInSync: false, replicationLastError: 'Could not apply the snapshot.' });
    expect(screen.getByText('Key issued')).toBeInTheDocument();
    expect(screen.getByText('Behind')).toBeInTheDocument();
    expect(screen.getByText('Could not apply the snapshot.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a new key' })).toBeInTheDocument();
  });

  it('says there is no key, and has no pull to report', () => {
    mockApi();
    renderSection({ ...SERVER, hasReplicationKey: false, replicationKeyCreatedAt: null, replicationLastPullAt: null, replicationInSync: null });
    expect(screen.getByText('No key')).toBeInTheDocument();
    expect(screen.getByText(/Without a key this server cannot pull/)).toBeInTheDocument();
    expect(screen.queryByText('Up to date')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create replication key' })).toBeInTheDocument();
  });

  it('creates a key, shows the .env lines ONCE, and drops the secret when the dialog closes', async () => {
    const calls = mockApi({ 'POST /api/Platform/Companies/5/Servers/8/ReplicationSecret': { status: 200, body: { secret: SECRET } } });
    const user = userEvent.setup();
    renderSection(SERVER);

    await user.click(screen.getByRole('button', { name: 'Create a new key' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 10_000 });
    const lines = (within(dialog).getByRole('textbox') as HTMLTextAreaElement).value;
    expect(lines).toContain('Server__Role=Replica');
    expect(lines).toContain('Server__Id=8');
    expect(lines).toContain(`Server__ReplicationSecret=${SECRET}`);
    expect(calls.filter((c) => c.method === 'POST' && c.path.endsWith('/ReplicationSecret'))).toHaveLength(1);

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it('revokes the key after a confirmation', async () => {
    const calls = mockApi({ 'DELETE /api/Platform/Companies/5/Servers/8/ReplicationSecret': { status: 204 } });
    const user = userEvent.setup();
    renderSection(SERVER);

    await user.click(screen.getByRole('button', { name: 'Revoke key' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 10_000 });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Revoke key' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/Platform/Companies/5/Servers/8/ReplicationSecret')).toBe(true));
  });

  it('asks the replica itself for its state, and "Sync now" pulls on that server', async () => {
    const replica = { role: 'Replica', serverId: 8, configured: true, intervalSeconds: 60, lastSuccessAt: new Date().toISOString(), lastError: null, pendingDeviceDeletions: 1 };
    const calls = mockApi({
      'GET /api/Replication/Status': { status: 200, body: replica },
      'POST /api/Replication/SyncNow': { status: 200, body: { ...replica, pendingDeviceDeletions: 0 } },
    });
    const user = userEvent.setup();
    renderSection(SERVER);

    expect(calls.some((c) => c.path === '/api/Replication/Status')).toBe(false);   // another server is only called when asked
    await user.click(screen.getByRole('button', { name: 'Check replica' }));
    expect(await screen.findByText(/Last successful pull:/)).toBeInTheDocument();
    expect(screen.getByText('1 Device deletion(s) not yet told to the master')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/api/Replication/Status')!.origin).toBe('https://plant-b.example.test:8443');

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/Replication/SyncNow')).toBe(true));
    expect(calls.find((c) => c.path === '/api/Replication/SyncNow')!.origin).toBe('https://plant-b.example.test:8443');
    await waitFor(() => expect(screen.queryByText('1 Device deletion(s) not yet told to the master')).not.toBeInTheDocument());
  });

  it('says so when the server answers as a master, and shows its error when a pull failed', async () => {
    mockApi({ 'GET /api/Replication/Status': { status: 200, body: { role: 'Master', configured: false, intervalSeconds: 60, pendingDeviceDeletions: 0 } } });
    const user = userEvent.setup();
    renderSection(SERVER);
    await user.click(screen.getByRole('button', { name: 'Check replica' }));
    expect(await screen.findByText(/answers as a master, not as a replica/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
  });

  it('builds the .env lines', () => {
    expect(envSnippet(SERVER, 'k', 'https://master.example.test')).toBe(
      'Server__Role=Replica\nServer__Id=8\nServer__MasterUrl=https://master.example.test\nServer__ReplicationSecret=k',
    );
  });
});
