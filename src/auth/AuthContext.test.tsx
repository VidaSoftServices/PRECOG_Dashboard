import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { queryClient } from '@/api/queryClient';
import { AuthProvider, useAuth } from './AuthContext';
import * as authStore from './authStore';
import { loadLoginPage } from './loadLoginPage';
import { mockFetchJsonAlways } from '@/test/mockFetch';

function Consumer() {
  const { hasAuthorizedCompany, userDetails } = useAuth();
  return <div>hasAuthorizedCompany: {String(hasAuthorizedCompany)} | companyName: {userDetails?.companyName ?? 'loading'}</div>;
}

function renderWithSession() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
}

vi.mock('./loadLoginPage', () => ({ loadLoginPage: vi.fn() }));

describe('AuthContext hasAuthorizedCompany', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('is true once CurrentUserDto resolves a real Company', async () => {
    mockFetchJsonAlways(200, {
      userId: 1,
      companyId: 1,
      companyName: 'Acme Manufacturing',
      hasAuthorizedCompany: true,
      isCompanyAdmin: false,
    });
    renderWithSession();
    expect(await screen.findByText(/hasAuthorizedCompany: true/)).toBeInTheDocument();
    expect(screen.getByText(/companyName: Acme Manufacturing/)).toBeInTheDocument();
  });

  it('is false for the documented "Unknown" no-Company response, never fabricating access', async () => {
    mockFetchJsonAlways(200, {
      userId: 2,
      companyId: null,
      companyName: 'Unknown',
      hasAuthorizedCompany: false,
      isCompanyAdmin: false,
    });
    renderWithSession();
    expect(await screen.findByText(/hasAuthorizedCompany: false/)).toBeInTheDocument();
  });
});

describe('AuthContext logout', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('forgets everything of the person: session, cached data, and loads /login afresh', async () => {
    mockFetchJsonAlways(200, { userId: 1, companyId: 1, companyName: 'Acme', hasAuthorizedCompany: true, isCompanyAdmin: true });
    queryClient.setQueryData(['devices'], [{ id: 1, name: 'KS4' }]);

    function SignOut() {
      const { logout } = useAuth();
      return <button onClick={logout}>sign out</button>;
    }
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    render(
      <AuthProvider>
        <SignOut />
      </AuthProvider>,
    );
    await userEvent.click(screen.getByText('sign out'));

    expect(authStore.getSession()).toBeNull();
    expect(queryClient.getQueryData(['devices'])).toBeUndefined(); // the previous person's cached Devices are gone
    expect(loadLoginPage).toHaveBeenCalledTimes(1); // a full page load: no module-level or in-tree state survives
  });
});
