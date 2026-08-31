import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import * as authStore from './authStore';
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
