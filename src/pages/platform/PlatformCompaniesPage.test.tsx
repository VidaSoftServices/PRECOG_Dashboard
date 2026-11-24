import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PlatformCompaniesPage } from './PlatformCompaniesPage';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { setLanguage } from '@/lib/language';
import { fetchMock } from '@/test/mockFetch';

const COMPANIES = [
  { id: 1, name: 'VidaSoft', enabled: true, locked: false, userCount: 6, adminCount: 3, createdAt: '2026-01-01T00:00:00Z' },
  { id: 2, name: 'Synced Co', enabled: true, locked: true, userCount: 1, adminCount: 1, createdAt: '2026-01-01T00:00:00Z' },
  { id: 3, name: 'New Co', enabled: true, locked: false, userCount: 0, adminCount: 0, createdAt: '2026-01-01T00:00:00Z' },
];
const MEMBERS = [
  { userId: 7, displayName: 'Anna Admin', email: 'anna@example.test', enabled: true, companyRoles: ['Admin'] },
  { userId: 8, displayName: 'Rita Reader', email: 'rita@example.test', enabled: true, companyRoles: ['Reader'] },
];
const INVITATIONS = [{ id: 31, email: 'pending@example.test', roleName: 'Reader', language: 'en', createdAt: '2026-11-20T10:00:00Z', expiresAt: '2026-11-27T10:00:00Z' }];

interface Recorded {
  method: string;
  path: string;
  body: unknown;
  hasKey: boolean;
}

function mockApi(overrides: Record<string, { status: number; body?: unknown }> = {}): Recorded[] {
  const calls: Recorded[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    const text = await request.clone().text();
    calls.push({ method: request.method, path, body: text ? JSON.parse(text) : undefined, hasKey: request.headers.has('HMAC_Key') });

    const key = `${request.method} ${path}`;
    let answer: { status: number; body?: unknown } | undefined = overrides[key];
    if (!answer) {
      if (key === 'GET /api/Platform/Companies') answer = { status: 200, body: COMPANIES };
      else if (key === 'POST /api/Platform/Companies') answer = { status: 201, body: { ...COMPANIES[2], id: 4, name: 'Created Co' } };
      else if (/GET \/api\/Platform\/Companies\/\d+\/Members$/.test(key)) answer = { status: 200, body: MEMBERS };
      else if (/GET \/api\/Platform\/Companies\/\d+\/Invitations$/.test(key)) answer = { status: 200, body: INVITATIONS };
      else if (/POST \/api\/Platform\/Companies\/\d+\/Invitations$/.test(key))
        answer = { status: 201, body: { invitation: { ...INVITATIONS[0], id: 32, email: 'first.admin@example.test', roleName: 'Admin' }, emailSent: true } };
      else if (/PUT \/api\/Platform\/Companies\/\d+\/Enabled$/.test(key)) answer = { status: 200, body: { ...COMPANIES[0], enabled: false } };
      else answer = { status: 204 };
    }
    const isText = typeof answer.body === 'string';
    return new Response(answer.status === 204 ? null : isText ? (answer.body as string) : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': isText ? 'text/plain' : 'application/json' },
    });
  });
  return calls;
}

function renderPage() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <PlatformCompaniesPage />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

beforeEach(() => setLanguage('en'));

describe('PlatformCompaniesPage', () => {
  it('lists the companies with their counts, marks the synchronized one and a company without an Admin', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByText('VidaSoft')).toBeInTheDocument();
    expect(screen.getByText('Synced Co')).toBeInTheDocument();
    expect(screen.getByText('No Admin yet')).toBeInTheDocument();
    expect(screen.getByText('Select a company to see its people and invitations.')).toBeInTheDocument();
  });

  it('creates a company with the trimmed name and an optional website', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('VidaSoft');

    await user.click(screen.getByRole('button', { name: 'Create company' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await user.type(within(dialog).getByLabelText(/Company name/), '  Created Co  ');
    await user.type(within(dialog).getByLabelText(/Website/), 'https://created.example.test');
    await user.click(within(dialog).getByRole('button', { name: 'Create', hidden: true }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/Platform/Companies')).toBe(true));
    const created = calls.find((c) => c.method === 'POST' && c.path === '/api/Platform/Companies')!;
    expect(created.body).toEqual({ name: 'Created Co', website: 'https://created.example.test' });
    expect(created.hasKey).toBe(true);
  });

  it('shows the refusal of the API for a name that exists, in the current language', async () => {
    mockApi({ 'POST /api/Platform/Companies': { status: 409, body: 'A Company with this name exists.' } });
    setLanguage('hu');
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('VidaSoft');

    await user.click(screen.getByRole('button', { name: 'Cég létrehozása' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await user.type(within(dialog).getByLabelText(/Cégnév/), 'VidaSoft');
    await user.click(within(dialog).getByRole('button', { name: /Létrehozás|Create/, hidden: true }));

    expect(await within(dialog).findByText('Már van ilyen nevű cég.')).toBeInTheDocument();
  });

  it('shows the people and the pending invitations of the selected company and invites by e-mail with the chosen role and language', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('VidaSoft'));

    expect(await screen.findByText('Anna Admin')).toBeInTheDocument();
    expect(screen.getByText('rita@example.test')).toBeInTheDocument();
    expect(await screen.findByText('pending@example.test')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^E-mail address/), '  First.Admin@Example.test ');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && /Invitations$/.test(c.path))).toBe(true));
    const invited = calls.find((c) => c.method === 'POST' && /Invitations$/.test(c.path))!;
    expect(invited.path).toBe('/api/Platform/Companies/1/Invitations');
    expect(invited.body).toEqual({ email: 'First.Admin@Example.test', roleName: 'Admin', language: 'en' });
  });

  it('withdraws a pending invitation', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('VidaSoft'));
    await screen.findByText('pending@example.test');

    await user.click(screen.getByRole('button', { name: 'Withdraw' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/Platform/Companies/1/Invitations/31')).toBe(true));
  });

  it('asks before revoking a role, and shows the last-Admin refusal of the API in Hungarian', async () => {
    const calls = mockApi({
      'DELETE /api/Platform/Companies/1/Members/7/Roles/Admin': { status: 409, body: 'A Company must keep at least one Admin: invite or grant another Admin first.' },
    });
    setLanguage('hu');
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('VidaSoft'));
    await screen.findByText('Anna Admin');

    await user.click(screen.getByRole('button', { name: 'Admin elvétele' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(within(dialog).getByText(/legalább egy Adminja/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);   // nothing happens before the confirmation

    await user.click(within(dialog).getByRole('button', { name: 'Visszavonás', hidden: true }));

    expect(await screen.findByText('Egy cégnek mindig marad legalább egy Adminja: előbb hívjon meg vagy jelöljön ki másik Admint.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/Platform/Companies/1/Members/7/Roles/Admin')).toBe(true);
  });

  it('grants a role without a confirmation', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('VidaSoft'));
    await screen.findByText('Rita Reader');

    await user.click(screen.getAllByRole('button', { name: 'Make Admin' })[0]!);

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/Platform/Companies/1/Members/8/Roles/Admin')).toBe(true));
  });

  it('can disable any company - also one the old WordPress sync marked as locked - and asks before doing it', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Synced Co'));
    expect(await screen.findByRole('button', { name: 'Disable company' })).toBeEnabled();

    await user.click(screen.getByText('VidaSoft'));
    await user.click(await screen.findByRole('button', { name: 'Disable company' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Disable', hidden: true }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.path === '/api/Platform/Companies/1/Enabled')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ enabled: false });
  });

  it('a company with an Admin cannot be deleted; one without gets a dialog that needs its name typed, then deletes', async () => {
    const calls = mockApi({ 'DELETE /api/Platform/Companies/3': { status: 200, body: { devicesDeleted: 2, usersKept: 1 } } });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('VidaSoft'));
    expect(await screen.findByRole('button', { name: 'Delete company' })).toBeDisabled();
    expect(screen.getByText(/with an Admin cannot be deleted/)).toBeInTheDocument();

    await user.click(screen.getByText('New Co'));
    const open = await screen.findByRole('button', { name: 'Delete company' });
    await waitFor(() => expect(open).toBeEnabled());
    await user.click(open);

    const dialog = await screen.findByRole('dialog', { hidden: true });
    const confirm = within(dialog).getByRole('button', { name: 'Delete company', hidden: true });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Type the company name to confirm'), 'new co');
    expect(confirm).toBeDisabled();   // the name is case sensitive
    await user.clear(within(dialog).getByLabelText('Type the company name to confirm'));
    await user.type(within(dialog).getByLabelText('Type the company name to confirm'), 'New Co');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/Platform/Companies/3')).toBe(true));
    expect(calls.find((c) => c.method === 'DELETE' && c.path === '/api/Platform/Companies/3')!.body).toEqual({ confirmName: 'New Co' });
  });
});
