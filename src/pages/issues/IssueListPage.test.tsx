import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { IssueListPage } from './IssueListPage';
import { SelectedDeviceProvider } from '@/app/SelectedDeviceProvider';
import { AuthProvider } from '@/auth/AuthContext';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const DEVICES = [{ id: 1, deviceName: 'Fan 1', externalDeviceId: 'fan1', applicationMode: 'continuous', enabled: true }];
const issue = (id: number, primarySensorId: number | null) => ({
  id, deviceId: 1, issueKey: id, primarySensorId, isCanonical: true, reviewState: 'PendingReview',
  measuredAtFrom: '2026-11-19T10:00:00Z', measuredAtTo: '2026-11-19T10:05:00Z',
});

function mockApi(issues: unknown[]) {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const path = new URL((input as Request).url).pathname;
    let body: unknown = [];
    if (path === '/api/Devices') body = DEVICES;
    else if (path === '/api/Devices/1/Sensors') body = [{ id: 11, name: 'Vibration X', externalSensorId: 'vx', direction: 'lowerisbetter', enabled: true }];
    else if (path === '/api/Issue') body = issues;
    else if (path === '/api/User/GetUserDetails') body = { isCompanyAdmin: true, hasAuthorizedCompany: true, userName: 'admin' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

function renderPage() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppToastProvider>
            <MemoryRouter initialEntries={['/issues?deviceId=1']}>
              <SelectedDeviceProvider>
                <IssueListPage />
              </SelectedDeviceProvider>
            </MemoryRouter>
          </AppToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('IssueListPage', () => {
  beforeEach(() => authStore.clearSession());

  it('writes the Sensor (indicator) name in the row of an Issue, before the from - to span', async () => {
    mockApi([issue(5, 11)]);
    renderPage();
    expect(await screen.findByText(/Vibration X · .*→/)).toBeInTheDocument();
  });

  it('marks the Issues whose e-mail was sent (icon + text), and only those', async () => {
    mockApi([
      { ...issue(7, 11), notificationSentAt: '2026-11-19T10:06:00Z', emailRecipientCount: 3 },
      issue(8, 11),
    ]);
    renderPage();
    expect(await screen.findByText('E-mail sent')).toBeInTheDocument();
    expect(screen.getAllByText('E-mail sent')).toHaveLength(1);
  });

  it('shows no e-mail mark when no Issue was mailed', async () => {
    mockApi([issue(9, 11)]);
    renderPage();
    expect(await screen.findByText(/Vibration X · .*→/)).toBeInTheDocument();
    expect(screen.queryByText('E-mail sent')).toBeNull();
  });

  it('shows just the time span for an Issue that is not attributable to one Sensor', async () => {
    mockApi([issue(6, null)]);
    renderPage();
    expect(await screen.findByText(/→/)).toBeInTheDocument();
    expect(screen.queryByText(/Vibration X/)).toBeNull();
  });
});
