import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AuthProvider, useAuth } from './AuthContext';
import { RequireAuth } from './RequireAuth';
import { SessionExpiredDialog } from './SessionExpiredDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import { apiClient, unwrap } from '@/api/client';
import { queryClient } from '@/api/queryClient';
import * as authStore from './authStore';
import { loadLoginPage } from './loadLoginPage';
import { fetchMock } from '@/test/mockFetch';

vi.mock('./loadLoginPage', () => ({ loadLoginPage: vi.fn() }));

interface Call {
  path: string;
  method: string;
  credentials: RequestCredentials | undefined;
  sessionHeader: string | null;
  hmac: string | null;
  body: string;
}

/**
 * The API as the browser session sees it: Refresh answers with `refreshKeys` one after the other (null = 401, no session), Devices accept only the keys in
 * `validKeys`, the sign-in hands out "key-login".
 */
function mockApi(options: { refreshKeys: (string | null)[]; validKeys: string[] }): Call[] {
  const calls: Call[] = [];
  const refreshes = [...options.refreshKeys];
  fetchMock().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const path = new URL(request.url).pathname;
    calls.push({
      path,
      method: request.method,
      credentials: input instanceof Request ? input.credentials : init?.credentials,
      sessionHeader: request.headers.get('X-Precog-Session'),
      hmac: request.headers.get('HMAC_Key'),
      body: await request.clone().text(),
    });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (path === '/api/Authentication/Refresh') {
      const key = refreshes.length > 1 ? refreshes.shift() : refreshes[0];
      return key ? json({ _HMAC_Key: key, userName: 'anna' }) : json({ message: 'The session ended. Sign in again.' }, 401);
    }
    if (path === '/api/Authentication/SignOut') return new Response(null, { status: 204 });
    if (path === '/api/Authentication/Request_HMAC_Key') return json({ _HMAC_Key: 'key-login' });
    if (path === '/api/User/GetUserDetails') return json({ userId: 1, companyId: 1, hasAuthorizedCompany: true, hasRole: true, isCompanyAdmin: false });
    if (path === '/api/Devices') {
      const key = request.headers.get('HMAC_Key');
      return key && options.validKeys.includes(key) ? json([{ id: 1, deviceName: 'KS4' }]) : json('expired', 401);
    }
    return new Response(null, { status: 204 });
  });
  return calls;
}

function Devices() {
  const { logout, login } = useAuth();
  const devices = useQuery({ queryKey: ['session-test-devices'], queryFn: async () => unwrap(await apiClient.GET('/api/Devices')), retry: false });
  return (
    <div>
      <span data-testid="devices">{devices.isSuccess ? `devices:${devices.data.length}` : devices.isError ? 'error' : 'loading'}</span>
      <button onClick={logout}>sign out</button>
      <button onClick={() => void login('anna', 'pw').catch(() => undefined)}>sign in</button>
    </div>
  );
}

function renderApp() {
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={['/']}>
              <Routes>
                <Route path="/login" element={<SignInPage />} />
                <Route element={<RequireAuth />}>
                  <Route path="/" element={<Devices />} />
                </Route>
              </Routes>
            </MemoryRouter>
            <SessionExpiredDialog />
          </AuthProvider>
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

function SignInPage() {
  const { login } = useAuth();
  return (
    <div>
      Sign-in page
      <button onClick={() => void login('anna', 'pw').catch(() => undefined)}>sign in</button>
    </div>
  );
}

describe('browser session (stay signed in until sign-out)', { timeout: 20_000 }, () => {
  beforeEach(() => {
    authStore.clearSession();
    queryClient.clear();
    vi.mocked(loadLoginPage).mockClear();
  });

  it('a page load with a valid session cookie signs in without the password, asking with credentials and the session header', async () => {
    const calls = mockApi({ refreshKeys: ['key-1'], validKeys: ['key-1'] });
    renderApp();

    expect(await screen.findByText('devices:1')).toBeInTheDocument();
    expect(screen.queryByText('Sign-in page')).not.toBeInTheDocument();
    const refresh = calls.find((c) => c.path === '/api/Authentication/Refresh')!;
    expect(refresh.method).toBe('POST');
    expect(refresh.credentials).toBe('include');
    expect(refresh.sessionHeader).toBe('1');
    expect(refresh.hmac).toBeNull(); // no key travels with it
    expect(authStore.getToken()).toBe('key-1');
  });

  it('without a session the sign-in page follows, and the sign-in asks the API to start a session (credentials included)', async () => {
    const calls = mockApi({ refreshKeys: [null], validKeys: ['key-login'] });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'sign in' }));
    await waitFor(() => expect(authStore.getToken()).toBe('key-login'));
    const signIn = calls.find((c) => c.path === '/api/Authentication/Request_HMAC_Key')!;
    expect(JSON.parse(signIn.body)).toEqual({ userName: 'anna', password: 'pw', startSession: true });
    expect(signIn.credentials).toBe('include');
  });

  it('a 401 is answered by a silent renewal: no dialog, and the failed request is repeated with the new key', async () => {
    authStore.setSession({ token: 'key-old', principalType: 'User', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    const calls = mockApi({ refreshKeys: ['key-new'], validKeys: ['key-new'] });
    renderApp();

    expect(await screen.findByText('devices:1')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/api/Devices').map((c) => c.hmac)).toEqual(['key-old', 'key-new']);
    expect(screen.queryByText('Your session has expired')).not.toBeInTheDocument();
  });

  it('when the session has ended too, the sign-in dialog asks for the password over the page', async () => {
    authStore.setSession({ token: 'key-old', principalType: 'User', expiresAt: new Date(Date.now() + 600_000).toISOString() });
    mockApi({ refreshKeys: [null], validKeys: ['key-login'] });
    renderApp();

    expect(await screen.findByText('Your session has expired')).toBeInTheDocument();
  });

  it('renews the key shortly before it ends, without any request failing', async () => {
    // a key that ends in 61 s is renewed about 1 s from now (one minute ahead)
    authStore.setSession({ token: 'key-1', principalType: 'User', expiresAt: new Date(Date.now() + 61_000).toISOString() });
    const calls = mockApi({ refreshKeys: ['key-2'], validKeys: ['key-1', 'key-2'] });
    renderApp();

    await waitFor(() => expect(authStore.getToken()).toBe('key-2'), { timeout: 4000 });
    expect(calls.filter((c) => c.path === '/api/Devices').every((c) => c.hmac === 'key-1')).toBe(true);
    expect(screen.queryByText('Your session has expired')).not.toBeInTheDocument();
  });

  it('sign-out ends the session on the API (credentials included) before the fresh page load', async () => {
    const calls = mockApi({ refreshKeys: ['key-1'], validKeys: ['key-1'] });
    const user = userEvent.setup();
    renderApp();
    await screen.findByText('devices:1');

    await user.click(screen.getByRole('button', { name: 'sign out' }));
    await waitFor(() => expect(loadLoginPage).toHaveBeenCalledTimes(1));
    const signOut = calls.find((c) => c.path === '/api/Authentication/SignOut')!;
    expect(signOut.credentials).toBe('include');
    expect(signOut.sessionHeader).toBe('1');
    expect(authStore.getSession()).toBeNull();
  });
});
