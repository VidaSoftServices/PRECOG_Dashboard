import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ReadersPage } from './ReadersPage';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { setLanguage } from '@/lib/language';
import { fetchMock } from '@/test/mockFetch';

const MEMBERS = [
  { userId: 7, displayName: 'Anna Admin', email: 'anna@example.test', enabled: true, companyRoles: ['Admin'], origin: 'Local' },
  { userId: 8, displayName: 'Wanda WordPress', email: 'wanda@example.test', enabled: true, companyRoles: [], origin: 'WordPress' },
];
const PENDING = [{ id: 31, email: 'pending@example.test', roleName: 'Reader', language: 'en', createdAt: '2026-11-20T10:00:00Z', expiresAt: '2026-11-27T10:00:00Z' }];

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
      if (key === 'GET /api/Company/Members') answer = { status: 200, body: MEMBERS };
      else if (key === 'GET /api/Company/Invitations') answer = { status: 200, body: PENDING };
      else if (key === 'GET /api/Company/Readers') answer = { status: 200, body: [] };
      else if (key === 'GET /api/Devices') answer = { status: 200, body: [] };
      else if (key === 'POST /api/Company/Invitations')
        answer = { status: 201, body: { invitation: { ...PENDING[0], id: 32, email: 'new.person@example.test' }, emailSent: true } };
      else if (/^DELETE \/api\/Company\/Members\/\d+$/.test(key)) answer = { status: 200, body: { deactivated: false } };
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
          <ReadersPage />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

beforeEach(() => setLanguage('en'));

describe('ReadersPage: the people of the Company', () => {
  it('marks the person that comes from the old WordPress list, and only that one, and offers only Remove to each', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByText('Anna Admin')).toBeInTheDocument();
    expect(screen.getAllByText('WordPress')).toHaveLength(1);                         // exactly one badge: Wanda's
    expect(screen.queryByRole('button', { name: /WordPress/ })).toBeNull();           // no link / unlink any more
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
  });

  it('lets the Admin change the roles of a person from the old WordPress list like anyone else', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Wanda WordPress');

    const wandaRow = screen.getByText('Wanda WordPress').closest('div')!.parentElement!;
    await user.click(within(wandaRow).getByLabelText('Reader'));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/Company/Members/8/Roles')).toBe(true));
    expect(calls.find((c) => c.path === '/api/Company/Members/8/Roles')!.body).toEqual({ roleName: 'Reader' });
  });

  it('removes a person only after the confirmation', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Anna Admin');

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Remove', hidden: true }));

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/Company/Members/7')).toBe(true));
  });

  it('shows why the last Admin cannot be removed, in Hungarian', async () => {
    mockApi({ 'DELETE /api/Company/Members/7': { status: 409, body: 'This User is the last Admin of the Company, so it cannot be removed: make someone else an Admin first.' } });
    setLanguage('hu');
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Anna Admin');

    await user.click(screen.getAllByRole('button', { name: 'Eltávolítás' })[0]!);
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await user.click(within(dialog).getByRole('button', { name: 'Eltávolítás', hidden: true }));

    expect(await screen.findByText(/a cég utolsó Adminja, ezért nem távolítható el/)).toBeInTheDocument();
  });

  it('invites one person at a time by e-mail (Reader by default), lists the pending ones and withdraws one', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('pending@example.test')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^E-mail address/), '  New.Person@Example.test ');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/Company/Invitations')).toBe(true));
    const invited = calls.find((c) => c.method === 'POST' && c.path === '/api/Company/Invitations')!;
    expect(invited.body).toEqual({ email: 'New.Person@Example.test', roleName: 'Reader', language: 'en' });
    expect(invited.hasKey).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/Company/Invitations/31')).toBe(true));
  });
});
