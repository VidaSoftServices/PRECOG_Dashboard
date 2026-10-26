import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AuthProvider, useAuth } from './AuthContext';
import { SessionExpiredDialog } from './SessionExpiredDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import { apiClient, unwrap } from '@/api/client';
import * as authStore from './authStore';
import { fetchMock } from '@/test/mockFetch';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A page that signs in as "anna" and shows one query, next to a field with text typed into it. */
function Page() {
  const { login, isAuthenticated } = useAuth();
  const devices = useQuery({
    queryKey: ['devices-test'],
    queryFn: async () => unwrap(await apiClient.GET('/api/Devices')),
    enabled: isAuthenticated,
    retry: false,
  });
  return (
    <div>
      <button onClick={() => void login('anna', 'first-password')}>start</button>
      <button onClick={() => void devices.refetch()}>reload</button>
      <span data-testid="state">{devices.isError ? 'error' : devices.isSuccess ? `ok:${devices.data.length}` : 'idle'}</span>
      <input aria-label="a field on the page" />
    </div>
  );
}

function renderApp() {
  const queryClient = new QueryClient();
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <AuthProvider>
            <Page />
            <SessionExpiredDialog />
          </AuthProvider>
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('SessionExpiredDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('opens over the page on a 401, signs in again in place as the same user, and the failed query recovers', async () => {
    let devicesAuthorised = true;
    let keyCounter = 0;
    const seenTokens: (string | null)[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      const path = new URL(request.url).pathname;
      if (path === '/api/Authentication/Request_HMAC_Key') {
        const body = (await request.clone().json()) as { userName: string; password: string };
        if (body.password === 'wrong') return json('Login unsuccessful', 401);
        keyCounter += 1;
        return json({ _HMAC_Key: `key-${keyCounter}` });
      }
      if (path === '/api/User/GetUserDetails') return json({ userId: 1, companyId: 1, isCompanyAdmin: true, hasAuthorizedCompany: true });
      seenTokens.push(request.headers.get('HMAC_Key'));
      return devicesAuthorised ? json([{ id: 1 }, { id: 2 }]) : json('Unauthorized', 401);
    });

    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'start' }));
    expect(await screen.findByText('ok:2')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'a field on the page' }), 'half-typed note');

    // The access expires: the next request is refused.
    devicesAuthorised = false;
    await act(async () => {
      authStore.notifyUnauthorized();
    });
    expect(await screen.findByRole('alertdialog', { name: /session has expired/i })).toBeInTheDocument();
    // Asking again while expired fails fast, without calling the API with the refused token.
    const calls = seenTokens.length;
    await user.click(screen.getByRole('button', { name: 'reload', hidden: true }));
    expect(await screen.findByText('error')).toBeInTheDocument();
    expect(seenTokens).toHaveLength(calls);
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('anna');
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveAttribute('readonly');

    // A wrong password: the error is shown, the dialog stays, the page is untouched.
    await user.type(screen.getByLabelText(/^Password/), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/Login unsuccessful/)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog', { name: /session has expired/i })).toBeInTheDocument();

    // The right one: the dialog closes, the new token is used and the page recovers - with what was typed still there.
    devicesAuthorised = true;
    await user.type(screen.getByLabelText(/^Password/), 'right');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(authStore.isReauthRequired()).toBe(false);
    expect(authStore.getToken()).toBe('key-2');
    expect(await screen.findByText('ok:2')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'a field on the page' })).toHaveValue('half-typed note');
    expect(seenTokens[seenTokens.length - 1]).toBe('key-2');
  });

  it('offers Sign out, which ends the session instead of continuing', async () => {
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const path = new URL((input as Request).url).pathname;
      if (path === '/api/Authentication/Request_HMAC_Key') return json({ _HMAC_Key: 'key-1' });
      if (path === '/api/User/GetUserDetails') return json({ userId: 1, companyId: 1, isCompanyAdmin: true, hasAuthorizedCompany: true });
      return json([]);
    });
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'start' }));
    await screen.findByText('ok:0');
    await act(async () => {
      authStore.notifyUnauthorized();
    });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(authStore.getSession()).toBeNull();
    expect(authStore.isReauthRequired()).toBe(false);
  });
});
