import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { AuthProvider } from './AuthContext';
import * as authStore from './authStore';

function renderProtectedApp(initialEntries: string[]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects to /login when there is no session - the replacement for the old dashboard having no route guards at all', () => {
    renderProtectedApp(['/']);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders the protected route once a session exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ userId: 1, companyId: 1, isCompanyAdmin: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });

    renderProtectedApp(['/']);
    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  it('stops rendering protected content the moment the session is torn down (e.g. by a 401 anywhere - see authStore.test.ts for that half of the chain)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ userId: 1, companyId: 1, isCompanyAdmin: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });

    renderProtectedApp(['/']);
    expect(await screen.findByText('Protected Content')).toBeInTheDocument();

    authStore.notifyUnauthorized();

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });
});
