import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequirePlatformAdmin } from './RequirePlatformAdmin';
import { AuthProvider } from './AuthContext';
import * as authStore from './authStore';
import { mockFetchJsonAlways } from '@/test/mockFetch';
import { navEntries, visibleNavEntries } from '@/app/navConfig';

function renderPlatformOnlyApp(user: { isPlatformAdmin?: boolean; isCompanyAdmin?: boolean }) {
  mockFetchJsonAlways(200, { userId: 0, hasAuthorizedCompany: !user.isPlatformAdmin, companyId: user.isPlatformAdmin ? null : 1, ...user });
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });

  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/platform']}>
        <Routes>
          <Route element={<RequirePlatformAdmin />}>
            <Route path="/platform" element={<div>Platform Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('RequirePlatformAdmin', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('renders the platform page for the platform administrator', async () => {
    renderPlatformOnlyApp({ isPlatformAdmin: true });
    expect(await screen.findByText('Platform Content')).toBeInTheDocument();
  });

  it('gives a Company Admin and a Reader the in-page not-authorized state', async () => {
    renderPlatformOnlyApp({ isCompanyAdmin: true, isPlatformAdmin: false });
    expect(await screen.findByText("This section isn't available to you")).toBeInTheDocument();
    expect(screen.queryByText('Platform Content')).not.toBeInTheDocument();
  });
});

describe('the navigation', () => {
  it('has exactly one platform-only entry, and it is not an Admin or Company entry', () => {
    const platformOnly = navEntries.filter((e) => e.platformOnly);
    expect(platformOnly.map((e) => e.path)).toEqual(['/platform/companies']);
    expect(platformOnly[0]!.adminOnly).toBe(false);
  });

  it('shows the platform administrator only the platform entry, and nobody else that entry', () => {
    expect(visibleNavEntries(true, false).map((e) => e.path)).toEqual(['/platform/companies']);
    expect(visibleNavEntries(true, true).map((e) => e.path)).toEqual(['/platform/companies']);

    for (const isAdmin of [true, false]) {
      expect(visibleNavEntries(false, isAdmin).some((e) => e.platformOnly)).toBe(false);
    }
    expect(visibleNavEntries(false, true).some((e) => e.path === '/admin/readers')).toBe(true);
    expect(visibleNavEntries(false, false).some((e) => e.path === '/admin/readers')).toBe(false);
  });
});
