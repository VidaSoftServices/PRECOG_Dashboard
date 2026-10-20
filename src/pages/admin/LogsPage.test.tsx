import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { LogsPage } from './LogsPage';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const audit = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({
    id: offset + i + 1,
    occurredAt: '2026-10-21T10:00:00Z',
    action: i % 2 === 0 ? 'device.delete' : 'sensor.processing.off',
    entityType: 'Device',
    entityId: String(offset + i + 1),
    actorUserId: 7,
    actorName: 'Alice Admin',
    afterState: i === 0 && offset === 0 ? 'name=Press 7' : null,
  }));

const system = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    occurredAt: '2026-10-21T10:00:00Z',
    level: i === 0 ? 'ERROR' : 'INFO',
    application: 'Device',
    deviceId: 4,
    message: `message ${i + 1}`,
    properties: i === 0 ? '{"a":1}' : '{}',
  }));

/** Records the URL of every request, answering from `respond`. */
function mockApi(respond: (url: URL) => Response) {
  const urls: URL[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const url = new URL((input as Request).url);
    urls.push(url);
    return respond(url);
  });
  return urls;
}

function renderPage() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <MemoryRouter>
            <LogsPage />
          </MemoryRouter>
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('LogsPage', { timeout: 20_000 }, () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('shows the newest 30 activity entries by default - the request asks for take=30 and no filters', async () => {
    const urls = mockApi(() => json({ items: audit(30), hasMore: false }));
    renderPage();

    const table = await screen.findByRole('table', { name: 'Activity log' });
    expect(within(table).getAllByRole('row')).toHaveLength(31); // header + 30
    expect(urls[0]!.pathname).toBe('/api/Logs/Audit');
    expect(urls[0]!.searchParams.get('take')).toBe('30');
    expect(urls[0]!.searchParams.get('skip')).toBe('0');
    for (const key of ['from', 'to', 'action', 'entityType', 'entityId', 'actorUserId']) expect(urls[0]!.searchParams.has(key)).toBe(false);
    expect(screen.getByText(/Showing 30 entries, newest first/)).toBeInTheDocument();
    expect(screen.getAllByText('Alice Admin (user 7)').length).toBeGreaterThan(0);
    expect(screen.getByText('name=Press 7')).toBeInTheDocument();
  });

  it('"Load 30 more" fetches the next page and appends it', async () => {
    const urls = mockApi((url) => {
      const skip = Number(url.searchParams.get('skip'));
      return json({ items: audit(30, skip), hasMore: skip === 0 });
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('table', { name: 'Activity log' });
    await user.click(await screen.findByRole('button', { name: 'Load 30 more' }));

    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Activity log' })).getAllByRole('row')).toHaveLength(61));
    expect(urls.at(-1)!.searchParams.get('skip')).toBe('30');
    expect(screen.queryByRole('button', { name: 'Load 30 more' })).not.toBeInTheDocument();
  });

  it('applies the filters only when asked, and sends them as query parameters', async () => {
    const urls = mockApi(() => json({ items: audit(2), hasMore: false }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table', { name: 'Activity log' });
    const before = urls.length;

    await user.type(screen.getByLabelText(/^Action/), 'device.');
    await user.type(screen.getByLabelText('User id'), '7');
    expect(urls.length).toBe(before); // typing alone sends nothing

    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(urls.length).toBe(before + 1));
    const last = urls.at(-1)!;
    expect(last.searchParams.get('action')).toBe('device.');
    expect(last.searchParams.get('actorUserId')).toBe('7');
    expect(last.searchParams.get('skip')).toBe('0');
    expect(last.searchParams.get('take')).toBe('30');
  });

  it('Reset clears the filters and goes back to the plain newest-30 list', async () => {
    const urls = mockApi(() => json({ items: audit(1), hasMore: false }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table', { name: 'Activity log' });

    await user.type(screen.getByLabelText(/^Action/), 'device.');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(urls.at(-1)!.searchParams.get('action')).toBe('device.'));
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(urls.at(-1)!.searchParams.has('action')).toBe(false));
    expect((screen.getByLabelText(/^Action/) as HTMLInputElement).value).toBe('');
  });

  it('an empty result says so, differently with and without filters', async () => {
    mockApi(() => json({ items: [], hasMore: false }));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('No activity recorded yet')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Action/), 'nothing');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText('No entries match these filters')).toBeInTheDocument();
  });

  it('a server refusal (for example a Reader getting 403) is shown instead of a list', async () => {
    mockApi(() => new Response('Forbidden', { status: 403 }));
    renderPage();

    expect(await screen.findByText(/Couldn.t load this/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // A refusal is not retryable, so no Retry button is offered.
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('the System log tab lists entries with an icon + text level, and filters by level and text', async () => {
    const urls = mockApi((url) => (url.pathname === '/api/Logs/System' ? json({ items: system(30), hasMore: false }) : json({ items: [], hasMore: false })));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'System log' }));
    const table = await screen.findByRole('table', { name: 'System log' });
    expect(within(table).getAllByRole('row')).toHaveLength(31);
    expect(within(table).getByText('ERROR')).toBeInTheDocument(); // the level is text, not only a colour
    expect(within(table).getByText('message 1')).toBeInTheDocument();
    const first = urls.find((u) => u.pathname === '/api/Logs/System')!;
    expect(first.searchParams.get('take')).toBe('30');
    expect(first.searchParams.has('minLevel')).toBe(false);

    await user.selectOptions(screen.getByLabelText(/^Level/), 'WARNING');
    await user.type(screen.getByLabelText('Message contains'), 'timeout');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(urls.at(-1)!.searchParams.get('minLevel')).toBe('WARNING'));
    expect(urls.at(-1)!.searchParams.get('text')).toBe('timeout');
  });

  it('shows the explanation of the API when the time window is refused', async () => {
    mockApi((url) =>
      url.pathname === '/api/Logs/System'
        ? new Response('The time window must not exceed 31 days (the system log is very large). Narrow from/to.', { status: 400 })
        : json({ items: [], hasMore: false }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: 'System log' }));
    expect(await screen.findByText(/must not exceed 31 days/)).toBeInTheDocument();
  });
});
