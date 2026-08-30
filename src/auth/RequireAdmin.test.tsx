import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAdmin } from './RequireAdmin';
import { AuthProvider } from './AuthContext';
import * as authStore from './authStore';
import { mockFetchJsonAlways } from '@/test/mockFetch';

function renderAdminOnlyApp(isCompanyAdmin: boolean) {
  mockFetchJsonAlways(200, { userId: 1, companyId: 1, isCompanyAdmin });
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<div>Admin Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('RequireAdmin', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('renders the Admin-only route content for a Company Admin', async () => {
    renderAdminOnlyApp(true);
    expect(await screen.findByText('Admin Content')).toBeInTheDocument();
  });

  it("renders an in-page not-authorized state for a Reader, matching the backend's own Forbid() rather than redirecting away", async () => {
    renderAdminOnlyApp(false);
    expect(await screen.findByText("This section isn't available to you")).toBeInTheDocument();
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });
});
