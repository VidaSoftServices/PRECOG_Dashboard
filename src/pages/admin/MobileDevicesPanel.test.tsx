import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { MobileDevicesPanel } from './MobileDevicesPanel';
import { looksLikeMacAddress } from '@/lib/macAddress';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const QUEUED = [
  {
    id: 11,
    macAddress: 'AA:BB:CC:DD:EE:FF',
    status: 'Queued',
    requestedAt: '2026-10-18T08:00:00Z',
    requestedDeviceId: 1,
    requestedDeviceName: 'Line 1',
    statusChangedAt: '2026-10-18T08:00:00Z',
  },
];

const MEMBERS = [
  { userId: 7, displayName: 'Anna Admin', email: 'anna@example.test', enabled: true, companyRoles: ['Admin'] },
  { userId: 8, displayName: 'Rita Reader', email: 'rita@example.test', enabled: true, companyRoles: ['Reader'] },
  { userId: 9, displayName: 'Dora Disabled', email: 'dora@example.test', enabled: false, companyRoles: ['Reader'] },
  { userId: 10, displayName: 'Nora NoRole', email: 'nora@example.test', enabled: true, companyRoles: [] },
];

interface Recorded {
  method: string;
  url: string;
  body: unknown;
}

/** Serves the registry list for the selected status plus Company members, and records every write so a test can assert what was actually sent. */
function mockApi(lists: Record<string, unknown[]>): Recorded[] {
  const writes: Recorded[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const url = request.url;
    const json = (body: unknown, status = 200) =>
      new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (request.method !== 'GET') {
      const text = await request.clone().text();
      writes.push({ method: request.method, url, body: text ? JSON.parse(text) : undefined });
      return json({ id: 11, macAddress: 'AA:BB:CC:DD:EE:FF', status: 'Assigned' });
    }
    if (url.includes('/api/Company/Members')) return json(MEMBERS);
    if (url.includes('/api/MacAddresses')) {
      const status = new URL(url).searchParams.get('status') ?? '';
      return json(lists[status] ?? []);
    }
    throw new Error(`mockApi: unexpected request ${request.method} ${url}`);
  });
  return writes;
}

function renderPanel() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <MobileDevicesPanel />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('looksLikeMacAddress', () => {
  it.each(['AA:BB:CC:DD:EE:FF', 'aa-bb-cc-dd-ee-ff', 'aabb.ccdd.eeff', 'AABBCCDDEEFF', '  AA:BB:CC:DD:EE:FF '])('accepts %s', (value) => {
    expect(looksLikeMacAddress(value)).toBe(true);
  });

  it.each(['', 'AA:BB:CC:DD:EE', 'AA:BB:CC:DD:EE:FF:00', 'GG:BB:CC:DD:EE:FF', 'not a mac'])('rejects %s', (value) => {
    expect(looksLikeMacAddress(value)).toBe(false);
  });
});

describe('MobileDevicesPanel', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('lists the registration queue with the requesting Device', async () => {
    mockApi({ Queued: QUEUED });
    renderPanel();

    expect(await screen.findByText('AA:BB:CC:DD:EE:FF')).toBeInTheDocument();
    expect(screen.getByText(/via Line 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign to user' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blacklist' })).toBeInTheDocument();
  });

  it('shows an explicit empty state for an empty queue', async () => {
    mockApi({ Queued: [] });
    renderPanel();

    expect(await screen.findByText('No MAC addresses are waiting')).toBeInTheDocument();
  });

  it('assigns a queued MAC address to a User with one PUT', async () => {
    const writes = mockApi({ Queued: QUEUED });
    const user = userEvent.setup();
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Assign to user' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });

    // `hidden: true`: Fluent/Tabster marks the dialog aria-hidden while another test file loads the machine; the content is what is under test.
    // Only enabled Admin/Reader members can own a MAC address: no disabled user, no user without a role.
    const select = await within(dialog).findByRole('combobox', { name: 'User', hidden: true });
    await waitFor(() => expect(within(select).getAllByRole('option', { hidden: true }).length).toBe(3));
    expect(within(select).getByRole('option', { hidden: true, name: 'Anna Admin (Admin)' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { hidden: true, name: 'Rita Reader (Reader)' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { hidden: true, name: /Dora/ })).not.toBeInTheDocument();
    expect(within(select).queryByRole('option', { hidden: true, name: /Nora/ })).not.toBeInTheDocument();

    const assign = within(dialog).getByRole('button', { name: 'Assign', hidden: true });
    expect(assign).toBeDisabled();

    await user.selectOptions(select, '8');
    await user.click(assign);

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.method).toBe('PUT');
    expect(writes[0]!.url).toContain('/api/MacAddresses/11');
    expect(writes[0]!.body).toEqual({ status: 'Assigned', userId: 8, label: '' });
  });

  it('blacklists only after confirmation', async () => {
    const writes = mockApi({ Queued: QUEUED });
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Blacklist' }));
    expect(writes).toHaveLength(0);

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Blacklist', hidden: true }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toEqual({ status: 'Blacklisted' });
  });

  it('offers "Move to queue" for a blacklisted MAC address, and no Blacklist action', async () => {
    mockApi({
      Blacklisted: [{ id: 12, macAddress: '02:11:22:33:44:55', status: 'Blacklisted', requestedAt: '2026-10-17T08:00:00Z', statusChangedAt: '2026-10-18T08:00:00Z' }],
    });
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('tab', { name: 'Blacklist' }));

    expect(await screen.findByText('02:11:22:33:44:55')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign to user' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Blacklist' })).not.toBeInTheDocument();
  });

  it('shows who an assigned MAC address belongs to and offers Reassign', async () => {
    mockApi({
      Assigned: [
        {
          id: 13,
          macAddress: '02:AA:BB:CC:DD:EE',
          status: 'Assigned',
          userId: 7,
          userDisplayName: 'Anna Admin',
          userRole: 'Admin',
          label: 'Anna phone',
          requestedAt: '2026-10-17T08:00:00Z',
          statusChangedAt: '2026-10-18T08:00:00Z',
        },
      ],
    });
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('tab', { name: 'Registered' }));

    expect(await screen.findByText('Anna Admin')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText(/Anna phone/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reassign' })).toBeInTheDocument();
  });
});
