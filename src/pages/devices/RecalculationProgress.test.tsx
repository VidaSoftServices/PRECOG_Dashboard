import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { RecalculationProgress, SensorRecalculationNote } from './RecalculationProgress';
import type { RecalculationStatusDto } from '@/api/hooks/recalculation';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

function renderProgress(isAdmin = true) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <RecalculationProgress deviceId={4} isAdmin={isAdmin} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const running = {
  deviceId: 4,
  exists: true,
  active: true,
  jobId: 'j1',
  status: 'Running',
  totalReadings: 33210,
  doneReadings: 12345,
  percent: 37.2,
  sensorsTotal: 12,
  sensorsFinished: 3,
  currentSensorId: 7,
  currentSensorName: 'Acceleration RMS X',
  currentPhase: 'Analysing',
  sensors: [],
};

describe('RecalculationProgress', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('shows nothing when no recalculation exists', async () => {
    fetchMock().mockImplementation(async () => json({ deviceId: 4, exists: false, active: false }));
    const { container } = renderProgress();
    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('shows the percentage, the values done, the current Sensor and phase, and a Stop button for an Admin that sends DELETE', async () => {
    const calls: { method: string; path: string }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      calls.push({ method: request.method, path: new URL(request.url).pathname });
      return request.method === 'DELETE' ? new Response(null, { status: 204 }) : json(running);
    });
    const user = userEvent.setup();
    renderProgress(true);

    expect(await screen.findByText(/Recalculating from the start: 37\.2 %/)).toBeInTheDocument();
    expect(screen.getByText(/12,345 of 33,210 values/)).toBeInTheDocument();
    expect(screen.getByText(/Acceleration RMS X: evaluating the values one by one/)).toBeInTheDocument();
    expect(screen.getByText(/3 of 12 Sensor\(s\) finished/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Recalculation progress' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(calls).toContainEqual({ method: 'DELETE', path: '/api/Devices/4/Recalculation' }));
  });

  it('a Reader sees the progress but no Stop button', async () => {
    fetchMock().mockImplementation(async () => json(running));
    renderProgress(false);

    expect(await screen.findByText(/Recalculating from the start/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it('a recently finished run is summarised (Issues replaced / kept, Sensors left out) and can be dismissed', async () => {
    fetchMock().mockImplementation(async () =>
      json({
        deviceId: 4,
        exists: true,
        active: false,
        jobId: 'j1',
        status: 'Completed',
        finishedAt: new Date().toISOString(),
        totalReadings: 100,
        doneReadings: 100,
        percent: 100,
        sensors: [
          { sensorId: 1, name: 'S1', phase: 'Done', issuesDeleted: 3, reviewedIssuesKept: 1, aggregationLevelsReset: 2 },
          { sensorId: 2, name: 'S2', phase: 'Skipped', note: 'Calculation is switched off for this Sensor.' },
        ],
      }),
    );
    const user = userEvent.setup();
    renderProgress();

    expect(await screen.findByText('Recalculation finished')).toBeInTheDocument();
    expect(screen.getByText(/100 of 100 values evaluated; 3 unreviewed Issue\(s\) replaced, 1 reviewed Issue\(s\) kept\. 2 aggregation level\(s\) are being aggregated again in the background\./)).toBeInTheDocument();
    expect(screen.getByText(/Left out: S2 \(Calculation is switched off for this Sensor\.\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Recalculation finished')).not.toBeInTheDocument();
  });

  it('an old finished run is not shown again when the page is opened later', async () => {
    fetchMock().mockImplementation(async () =>
      json({ deviceId: 4, exists: true, active: false, jobId: 'j1', status: 'Completed', finishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), sensors: [] }),
    );
    const { container } = renderProgress();
    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(''));
  });
});

describe('SensorRecalculationNote', () => {
  const status = (sensors: object[], extra: object = {}) =>
    ({ deviceId: 4, exists: true, active: true, jobId: 'j1', status: 'Running', sensors, ...extra }) as RecalculationStatusDto;

  const show = (s: RecalculationStatusDto, sensorId: number) =>
    render(
      <FluentProvider theme={webLightTheme}>
        <SensorRecalculationNote status={s} sensorId={sensorId} />
      </FluentProvider>,
    );

  it('shows each Sensor of the run with its OWN percentage: waiting 0 %, working N % with the counts, done 100 %', () => {
    const s = status([
      { sensorId: 1, name: 'A', phase: 'Done', totalReadings: 100, doneReadings: 100 },
      { sensorId: 2, name: 'B', phase: 'Analysing', totalReadings: 200, doneReadings: 50 },
      { sensorId: 3, name: 'C', phase: 'Waiting', totalReadings: 300, doneReadings: 0 },
    ]);
    const first = show(s, 1);
    expect(screen.getByText('Recalculated: 100 %')).toBeInTheDocument();
    first.unmount();
    const second = show(s, 2);
    expect(screen.getByText('Recalculating: 25 % (50 / 200)')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Recalculation progress of B' })).toBeInTheDocument();
    second.unmount();
    show(s, 3);
    expect(screen.getByText('Waiting for its turn: 0 %')).toBeInTheDocument();
  });

  it('says why a Sensor was left out, shows nothing for a Sensor that is not in the run, and goes quiet a while after the run ended', () => {
    const skipped = show(status([{ sensorId: 4, name: 'D', phase: 'Skipped', note: 'Calculation is switched off for this Sensor.' }]), 4);
    expect(screen.getByText(/Not recalculated: Calculation is switched off/)).toBeInTheDocument();
    skipped.unmount();

    const other = show(status([{ sensorId: 1, name: 'A', phase: 'Analysing', totalReadings: 10, doneReadings: 1 }]), 9);
    expect(other.container.textContent).toBe('');
    other.unmount();

    const old = show(
      status([{ sensorId: 1, name: 'A', phase: 'Done', totalReadings: 10, doneReadings: 10 }], {
        active: false,
        status: 'Completed',
        finishedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      }),
      1,
    );
    expect(old.container.textContent).toBe('');
  });
});
