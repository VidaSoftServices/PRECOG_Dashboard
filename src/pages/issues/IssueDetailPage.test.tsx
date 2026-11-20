import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { IssueDetailPage } from './IssueDetailPage';
import { AuthProvider } from '@/auth/AuthContext';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

// jsdom has no canvas: the chart's drawing is replaced by a stub.
vi.mock('react-chartjs-2', () => ({ Line: () => <canvas data-testid="chart-canvas" /> }));

const ISSUE = {
  id: 5, deviceId: 1, issueKey: 1, primarySensorId: 11, sensorIds: [11], isCanonical: true, reviewState: 'PendingReview',
  periodFrom: 100, periodTo: 200, score: 7, measuredAtFrom: '2026-11-19T10:00:00Z', measuredAtTo: '2026-11-19T10:05:00Z', message: 'Vibration rose',
};

function mockApi() {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const path = new URL((input as Request).url).pathname;
    let body: unknown = [];
    if (path === '/api/Issue/5') body = ISSUE;
    else if (path === '/api/Issue/5/Group') body = { canonical: ISSUE, members: [] };
    else if (path === '/api/Issue/5/CategorySuggestion') body = null;
    else if (path === '/api/Devices/1') body = { id: 1, deviceName: 'Fan 1', applicationMode: 'continuous' };
    else if (path === '/api/Devices/1/Sensors') body = [{ id: 11, name: 'Vibration X', externalSensorId: 'vx', direction: 'lowerisbetter', enabled: true }];
    else if (path === '/api/Continuous/PeriodRange') body = [{ sensorId: 11, period: 150, measured: '2026-11-19T10:02:00Z', actual: 2, anomaly: 2 }];
    else if (path === '/api/Devices/1/Maintenances') body = { items: [] };
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
            <MemoryRouter initialEntries={['/issues/5']}>
              <Routes><Route path="/issues/:issueId" element={<IssueDetailPage />} /></Routes>
            </MemoryRouter>
          </AppToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('IssueDetailPage telemetry chart', () => {
  beforeEach(() => {
    authStore.clearSession();
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it('opens the chart large in a modal window (the Enlarge button is the keyboard route of clicking the chart)', async () => {
    mockApi();
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Enlarge chart: Vibration X' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Vibration X');
    expect(dialog.querySelector('[data-testid="chart-canvas"]')).not.toBeNull();
  });

  it('writes the Issue score (the number the API calculated) under the chart', async () => {
    mockApi();
    renderPage();
    const score = await screen.findByTestId('issue-score');
    expect(score).toHaveTextContent('Issue score: 7');
  });
});
