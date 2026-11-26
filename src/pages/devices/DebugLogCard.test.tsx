import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AppToastProvider } from '@/components/ToastProvider';
import { DebugLogCard } from './DebugLogCard';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

interface Sent {
  method: string;
  url: string;
  body: string;
}

/** A tiny stand-in for the API: the debug mode is off until a PUT with minutes > 0, then it is on and holds two lines; a PUT with 0 switches it off. */
function mockApi(): Sent[] {
  const sent: Sent[] = [];
  let on = false;
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const body = request.method === 'GET' ? '' : await request.clone().text();
    sent.push({ method: request.method, url: request.url, body });
    if (request.method === 'PUT') {
      on = JSON.parse(body).minutes > 0;
      return new Response(null, { status: 204 });
    }
    const data = on
      ? { active: true, secondsLeft: 3590, lastSeq: 2, dropped: 0, lines: [{ seq: 1, at: '2026-11-26T09:00:01Z', text: 'CAL WTVB02 #1 start' }, { seq: 2, at: '2026-11-26T09:00:06Z', text: 'CAL step 1 median 1486' }] }
      : { active: false, secondsLeft: 0, lastSeq: 0, dropped: 0, lines: [] };
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return sent;
}

function renderCard() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <DebugLogCard deviceId={4} deviceLabel="Press 7" />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('DebugLogCard', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('is off at first, switches the debug mode on for the chosen time and shows the text the Device sent', async () => {
    const sent = mockApi();
    const user = userEvent.setup();
    renderCard();
    expect(await screen.findByText('No debug text yet.')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Debug mode for'), '180');
    await user.click(screen.getByRole('button', { name: 'Switch on' }));

    await waitFor(() => expect(sent.some((s) => s.method === 'PUT')).toBe(true));
    expect(sent.find((s) => s.method === 'PUT')!.url).toMatch(/\/api\/Devices\/4\/Debug$/);
    expect(JSON.parse(sent.find((s) => s.method === 'PUT')!.body)).toEqual({ minutes: 180 });

    expect(await screen.findByText(/CAL WTVB02 #1 start/)).toBeInTheDocument();
    expect(screen.getByText(/CAL step 1 median 1486/)).toBeInTheDocument();
    expect(screen.getByText(/On, 60 min left/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });

  it('switches the debug mode off with minutes 0 and can clear the view', async () => {
    const sent = mockApi();
    const user = userEvent.setup();
    renderCard();
    await user.click(await screen.findByRole('button', { name: 'Switch on' }));
    await screen.findByText(/CAL step 1 median 1486/);

    await user.click(screen.getByRole('button', { name: 'Clear the view' }));
    expect(screen.queryByText(/CAL step 1 median 1486/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(sent.filter((s) => s.method === 'PUT').length).toBe(2));
    expect(JSON.parse(sent.filter((s) => s.method === 'PUT')[1]!.body)).toEqual({ minutes: 0 });
  });
});
