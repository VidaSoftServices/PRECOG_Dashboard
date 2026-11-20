import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
const drawn = vi.hoisted(() => ({ labels: [] as string[][] }));
vi.mock('react-chartjs-2', () => ({
  Line: (props: { data: { datasets: { label?: string }[] } }) => {
    drawn.labels.push(props.data.datasets.map((d) => d.label ?? ''));
    return <canvas data-testid="chart-canvas" />;
  },
}));

const ISSUE = {
  id: 5, deviceId: 1, issueKey: 1, primarySensorId: 11, sensorIds: [11], isCanonical: true, reviewState: 'PendingReview',
  periodFrom: 100, periodTo: 200, score: 7, measuredAtFrom: '2026-11-19T10:00:00Z', measuredAtTo: '2026-11-19T10:05:00Z', message: 'Vibration rose',
};

const requested: string[] = [];

function mockApi(issue: Record<string, unknown> = ISSUE) {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const path = new URL((input as Request).url).pathname;
    requested.push(path);
    let body: unknown = [];
    if (path === '/api/Issue/5') body = issue;
    else if (path === '/api/Issue/5/Group') body = { canonical: issue, members: [] };
    else if (path === '/api/Devices/1/AggregationPolicies') body = [{ id: 8, sensorId: 11, sourceDataKey: 'Actual', timeScale: 'Days', aggregationFunction: 'P95', enabled: true }];
    else if (path === '/api/Devices/1/Sensors/11/AggregationPolicies/8/Values')
      body = [
        { bucketStart: '2026-11-17T23:00:00Z', bucketEnd: '2026-11-18T23:00:00Z', value: 3.2, sampleCount: 10, calculatedAt: '2026-11-19T00:00:00Z', anomaly: 1 },
        { bucketStart: '2026-11-18T23:00:00Z', bucketEnd: '2026-11-19T23:00:00Z', value: 6.4, sampleCount: 10, calculatedAt: '2026-11-20T00:00:00Z', anomaly: 2 },
      ];
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

// Fluent dialogs are slow to mount under a loaded full-suite run; the default 5 s is too tight.
describe('IssueDetailPage telemetry chart', { timeout: 20_000 }, () => {
  beforeEach(() => {
    authStore.clearSession();
    drawn.labels = [];
    requested.length = 0;
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it('opens the chart large in a modal window (the Enlarge button is the keyboard route of clicking the chart)', async () => {
    mockApi();
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Enlarge chart: Vibration X' }));
    // hidden: true - while Fluent opens the dialog (its animation) it is still marked aria-hidden, which a loaded run can catch.
    const dialog = await screen.findByRole('dialog', { hidden: true }, { timeout: 8000 });
    expect(dialog).toHaveTextContent('Vibration X');
    expect(dialog.querySelector('[data-testid="chart-canvas"]')).not.toBeNull();
  });

  it('writes the Issue score (the number the API calculated) under the chart', async () => {
    mockApi();
    renderPage();
    const score = await screen.findByTestId('issue-score', {}, { timeout: 10_000 });
    expect(score).toHaveTextContent('Issue score: 7');
  });

  it('an Issue raised by a daily level draws the buckets of that level (not the raw readings), says so, and marks the level on the series', async () => {
    mockApi({ ...ISSUE, sourceAggregationPolicyId: 8 });
    renderPage();

    expect(await screen.findByText(/Raised by the aggregation level 1 day · 95th percentile/, {}, { timeout: 10_000 })).toBeInTheDocument();
    await waitFor(() => expect(drawn.labels.at(-1)).toContain('Vibration X · 1 day · 95th percentile'), { timeout: 10_000 });
    expect(requested).toContain('/api/Devices/1/Sensors/11/AggregationPolicies/8/Values');
    expect(requested).not.toContain('/api/Continuous/PeriodRange'); // the raw readings are not read for it
  });

  it('an Issue of the raw level still draws the raw readings of its period', async () => {
    mockApi();
    renderPage();

    await waitFor(() => expect(drawn.labels.at(-1)).toContain('Vibration X'), { timeout: 10_000 });
    expect(requested).toContain('/api/Continuous/PeriodRange');
    expect(requested.some((p) => p.endsWith('/Values'))).toBe(false);
    expect(screen.queryByText(/Raised by the aggregation level/)).toBeNull();
  });
});
