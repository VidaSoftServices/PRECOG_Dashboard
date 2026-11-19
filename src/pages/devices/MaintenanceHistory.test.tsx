import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AppToastProvider } from '@/components/ToastProvider';
import type { SensorDto } from '@/api/hooks/sensors';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';
import { EndMaintenanceDialog } from './EndMaintenanceDialog';
import { MaintenanceHistoryCard } from './MaintenanceHistoryCard';
import { ChangeMaintenanceKindDialog } from './ChangeMaintenanceKindDialog';
import type { SensorMaintenanceRecordDto } from '@/api/hooks/maintenance';

function wrap(children: ReactNode) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AppToastProvider>{children}</AppToastProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const replacement: SensorMaintenanceRecordDto = {
  id: 7,
  deviceId: 4,
  sensorId: 1,
  sensorName: '1# Velocity RMS Y',
  externalSensorId: 'velocity_rms_y_1',
  startedAt: '2026-03-12T06:00:00Z',
  endedAt: '2026-03-12T14:20:00Z',
  kind: 'Replacement',
  manualBaseline: false,
  note: 'Balancing',
  baselineState: 'Active',
  warmUps: [],
};
const minor: SensorMaintenanceRecordDto = { ...replacement, id: 8, startedAt: '2026-08-04T07:30:00Z', endedAt: '2026-08-04T09:05:00Z', kind: 'Minor', note: 'Lubrication', baselineState: null };
const running: SensorMaintenanceRecordDto = { ...replacement, id: 9, startedAt: '2026-11-19T08:12:00Z', endedAt: null, kind: null, note: null, baselineState: null };
const sensors = [{ id: 1, name: '1# Velocity RMS Y', externalSensorId: 'velocity_rms_y_1' }] as SensorDto[];

describe('EndMaintenanceDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('asks what was done, then needs the confirmation before it ends the maintenance', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => undefined);
    wrap(<EndMaintenanceDialog open targetLabel="1# Velocity RMS Y" busy={false} onSubmit={onSubmit} onClose={() => undefined} />);

    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeDisabled(); // nothing chosen yet
    await user.click(screen.getByRole('radio', { name: /Replacement or repair/ }));
    await user.type(screen.getByRole('textbox', { name: /Note/ }), 'Bearing replaced');
    await user.click(next);

    expect(screen.getByText('Was it really a replacement or repair?')).toBeInTheDocument();
    const end = screen.getByRole('button', { name: 'End maintenance' });
    expect(end).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /changes the baseline/ }));
    await user.click(end);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ kind: 'Replacement', note: 'Bearing replaced' }));
  });

  it('Back returns to the choice', async () => {
    const user = userEvent.setup();
    wrap(<EndMaintenanceDialog open targetLabel="S1" busy={false} onSubmit={async () => undefined} onClose={() => undefined} />);
    await user.click(screen.getByRole('radio', { name: /Minor maintenance/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Was it really a minor maintenance?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('What was done on the machine?', { selector: 'span' })).toBeInTheDocument();
  });
});

describe('MaintenanceHistoryCard', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('lists every maintenance with its kind; an Admin can change the kind of a finished one', async () => {
    fetchMock().mockImplementation(async () => json({ deviceId: 4, total: 3, items: [running, minor, replacement] }));
    wrap(<MaintenanceHistoryCard deviceId={4} sensors={sensors} isAdmin />);

    expect(await screen.findByText('Balancing')).toBeInTheDocument();
    expect(screen.getByText('Lubrication')).toBeInTheDocument();
    expect(screen.getByText('Replacement / repair')).toBeInTheDocument();
    expect(screen.getAllByText('Minor maintenance').length).toBeGreaterThan(0);
    expect(screen.getByText('In maintenance')).toBeInTheDocument();
    expect(screen.getByText('Current baseline')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Change kind' })).toHaveLength(2); // not for the running one
    expect(screen.getByRole('button', { name: /Start a new baseline/ })).toBeInTheDocument();
    const request = fetchMock().mock.calls[0]![0] as Request;
    expect(new URL(request.url).pathname).toBe('/api/Devices/4/Maintenances');
  });

  it('a Reader reads the history but gets no control', async () => {
    fetchMock().mockImplementation(async () => json({ deviceId: 4, total: 1, items: [replacement] }));
    wrap(<MaintenanceHistoryCard deviceId={4} sensors={sensors} isAdmin={false} />);

    expect(await screen.findByText('Balancing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change kind' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start a new baseline/ })).not.toBeInTheDocument();
  });
});

describe('ChangeMaintenanceKindDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('shows what is recalculated and the Issues in the span, then changes the kind after the confirmation', async () => {
    const calls: { method: string; path: string; body?: unknown }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      const url = new URL(request.url);
      calls.push({ method: request.method, path: url.pathname + url.search, body: request.method === 'PUT' ? await request.clone().json() : undefined });
      if (url.pathname.endsWith('/Preview'))
        return json({
          maintenanceId: 8,
          sensorId: 1,
          sensorName: '1# Velocity RMS Y',
          currentKind: 'Minor',
          newKind: 'Replacement',
          recalculateFrom: '2026-08-04T09:05:00Z',
          recalculateTo: '2026-11-19T11:00:00Z',
          readings: 1234,
          rawRecalculated: true,
          levels: ['Days AVG'],
          laterReplacements: [],
          issues: [{ issueId: 55, issueKey: 1842, measuredAtFrom: '2026-09-02T10:00:00Z', measuredAtTo: '2026-09-02T12:00:00Z', reviewState: 'PendingReview', level: 'Days AVG' }],
        });
      return json({ maintenance: { ...minor, kind: 'Replacement' }, recalculating: true, recalculationJobId: 'x', aggregatedBucketsReset: 3 });
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    wrap(<ChangeMaintenanceKindDialog deviceId={4} record={minor} open onClose={onClose} />);

    expect(await screen.findByText(/1234 reading\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('Days AVG')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /#1842/ })).toHaveAttribute('href', '/issues/55');
    expect(calls[0]!.path).toBe('/api/Devices/4/Maintenances/8/Preview?kind=Replacement');

    const confirm = screen.getByRole('button', { name: 'Change and recalculate' });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /is recalculated/ }));
    await user.click(confirm);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((c) => c.method === 'PUT')).toEqual({ method: 'PUT', path: '/api/Devices/4/Maintenances/8', body: { kind: 'Replacement', note: null } });
  });
});
