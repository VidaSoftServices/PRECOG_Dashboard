import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { PlatformUsersPage } from './PlatformUsersPage';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { setLanguage } from '@/lib/language';
import { LAST_ADMIN_WITH_DEVICES } from '@/lib/platformPeople';
import { fetchMock } from '@/test/mockFetch';

const COMPANIES = [
  { id: 1, name: 'VidaSoft', enabled: true, locked: false, userCount: 3, adminCount: 1, createdAt: '2026-01-01T00:00:00Z' },
  { id: 2, name: 'Plant Co', enabled: false, locked: false, userCount: 1, adminCount: 0, createdAt: '2026-01-01T00:00:00Z' },
];

const ANNA = { userId: 11, displayName: 'Anna', email: 'anna@example.test', companyId: 1, companyName: 'VidaSoft', companyEnabled: true, companyRoles: ['Admin'], enabled: true, origin: 'Local', createdAt: '2026-01-01T00:00:00Z' };
const BELA = { userId: 12, displayName: 'Béla', email: 'bela@example.test', companyId: 2, companyName: 'Plant Co', companyEnabled: false, companyRoles: [], enabled: false, origin: 'WordPress', createdAt: '2026-01-01T00:00:00Z' };

interface Recorded {
  method: string;
  path: string;
  query: string;
  body: unknown;
}

function mockApi(overrides: Record<string, { status: number; body?: unknown }[]> = {}): Recorded[] {
  const calls: Recorded[] = [];
  const queues = new Map(Object.entries(overrides).map(([k, v]) => [k, [...v]]));
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const url = new URL(request.url);
    const text = await request.clone().text();
    calls.push({ method: request.method, path: url.pathname, query: url.search, body: text ? JSON.parse(text) : undefined });
    const key = `${request.method} ${url.pathname}`;
    const queued = queues.get(key);
    let answer: { status: number; body?: unknown } | undefined = queued && queued.length > 0 ? (queued.length > 1 ? queued.shift() : queued[0]) : undefined;
    if (!answer) {
      if (key === 'GET /api/Platform/Companies') answer = { status: 200, body: COMPANIES };
      else if (key === 'GET /api/Platform/Users') answer = { status: 200, body: { total: 2, items: [ANNA, BELA] } };
      else if (request.method === 'DELETE' && url.pathname.includes('/Members/')) answer = { status: 200, body: { deactivated: false } };
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
          <PlatformUsersPage />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

// The first Fluent dialog of a worker is slow to open when the whole suite runs in parallel: give these tests room instead of a flaky 5 s.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => setLanguage('en'));

describe('PlatformUsersPage', () => {
  it('lists people across companies with their roles, origin and state, and marks a person with no role', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('anna@example.test')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Administrator')).toBeInTheDocument();
    expect(within(table).getByText('No role')).toBeInTheDocument();
    expect(within(table).getByText('Plant Co')).toBeInTheDocument();
    // Béla comes from WordPress and is disabled; so is his company
    expect(within(table).getAllByText('Disabled').length).toBeGreaterThanOrEqual(2);
  });

  it('sends the filters to the API', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Anna');

    await user.selectOptions(screen.getByLabelText('Role'), 'None');
    await waitFor(() => expect(calls.some((c) => c.path === '/api/Platform/Users' && c.query.includes('role=None'))).toBe(true));
    await user.selectOptions(screen.getByLabelText('Company'), '2');
    await waitFor(() => expect(calls.some((c) => c.path === '/api/Platform/Users' && c.query.includes('companyId=2') && c.query.includes('role=None'))).toBe(true));
  });

  it("moves a person to another company; the last Admin of a company with Devices is a question first", async () => {
    const calls = mockApi({ 'PUT /api/Platform/Users/11/Company': [{ status: 409, body: LAST_ADMIN_WITH_DEVICES }, { status: 204 }] });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Anna');

    await user.click(within(screen.getByText('anna@example.test').closest('tr')!).getByRole('button', { name: 'Change company' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 10_000 });
    await user.selectOptions(within(dialog).getByLabelText('New company'), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    // the API asked: this is the last Admin of a company with Devices
    const question = await screen.findByText(/This is the last Admin of a Company that has Devices\. After this/);
    expect(question).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PUT' && c.path === '/api/Platform/Users/11/Company')).toHaveLength(1);

    // the question is a second dialog opening while the first closes: wait for its button (slow under a full run)
    await user.click(await screen.findByRole('button', { name: 'Continue', hidden: true }, { timeout: 10_000 }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT' && c.path === '/api/Platform/Users/11/Company')).toHaveLength(2));
    const puts = calls.filter((c) => c.method === 'PUT' && c.path === '/api/Platform/Users/11/Company');
    expect(puts[0]?.body).toEqual({ companyId: 2, confirmLastAdmin: false });
    expect(puts[1]?.body).toEqual({ companyId: 2, confirmLastAdmin: true });
  });

  it('disables a person after a confirmation, and enables a disabled one at once', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Anna');

    await user.click(within(screen.getByText('anna@example.test').closest('tr')!).getByRole('button', { name: 'Disable' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 10_000 });
    await user.click(within(dialog).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.path === '/api/Platform/Users/11/Enabled')).toBe(true));
    expect(calls.find((c) => c.path === '/api/Platform/Users/11/Enabled')?.body).toEqual({ enabled: false, confirmLastAdmin: false });

    await user.click(within(screen.getByText('bela@example.test').closest('tr')!).getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/Platform/Users/12/Enabled')).toBe(true));
    expect(calls.find((c) => c.path === '/api/Platform/Users/12/Enabled')?.body).toEqual({ enabled: true, confirmLastAdmin: false });
  });

  it("shows the API's refusal of a removal in Hungarian", async () => {
    mockApi({ 'DELETE /api/Platform/Companies/1/Members/11': [{ status: 409, body: 'This Company has Devices and no Admin, so its Users cannot be removed one by one: delete the Company first (or give it an Admin).' }] });
    setLanguage('hu');
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Anna');

    await user.click(within(screen.getByText('anna@example.test').closest('tr')!).getByRole('button', { name: 'Eltávolítás' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 10_000 });
    await user.click(within(dialog).getByRole('button', { name: 'Eltávolítás' }));

    expect(await screen.findByText(/előbb töröld a céget/)).toBeInTheDocument();
  });

  it('shows a person with no company and removes them through their own call', async () => {
    const DRIFTER = { userId: 13, displayName: 'Drifter', email: 'drifter@example.test', companyRoles: [], enabled: false, origin: 'Local', createdAt: '2026-01-01T00:00:00Z' };
    const calls = mockApi({ 'GET /api/Platform/Users': [{ status: 200, body: { total: 1, items: [DRIFTER] } }] });
    const user = userEvent.setup();
    renderPage();

    const row = (await screen.findByText('drifter@example.test')).closest('tr')!;
    expect(within(row).getByText('No company')).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 10_000 });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/Platform/Users/13')).toBe(true));
    expect(calls.some((c) => c.method === 'DELETE' && c.path.includes('/Members/'))).toBe(false);
  });
});
