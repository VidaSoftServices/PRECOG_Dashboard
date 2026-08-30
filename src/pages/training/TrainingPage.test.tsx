import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { TrainingPage } from './TrainingPage';
import { AuthProvider } from '@/auth/AuthContext';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { mockFetchRoutes } from '@/test/mockFetch';

function renderAsRole(isCompanyAdmin: boolean) {
  mockFetchRoutes([
    { match: '/api/User/GetUserDetails', body: { userId: 1, companyId: 1, isCompanyAdmin } },
    { match: '/api/Devices', body: [{ id: 1, deviceName: 'Line 1', externalDeviceId: 'd1', applicationMode: 'continuous' }] },
    { match: '/api/Training/Requests', body: [] },
  ]);
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppToastProvider>
            <MemoryRouter initialEntries={['/training']}>
              <TrainingPage />
            </MemoryRouter>
          </AppToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('TrainingPage - Reader stays strictly read-only (correction item 1)', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('shows the manual "Request retraining" control to a Company Admin', async () => {
    renderAsRole(true);
    expect(await screen.findByRole('button', { name: 'Request retraining' })).toBeInTheDocument();
  });

  it('does NOT show the manual "Request retraining" control to a Reader, even though Training_CreateTrainingRequest is technically callable for one server-side', async () => {
    renderAsRole(false);
    // Wait for the page to finish its initial data load (the device
    // selector showing the mocked Device) before asserting the control's
    // absence, so this isn't just catching an earlier not-yet-rendered state.
    expect(await screen.findByDisplayValue('Line 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request retraining' })).not.toBeInTheDocument();
  });
});
