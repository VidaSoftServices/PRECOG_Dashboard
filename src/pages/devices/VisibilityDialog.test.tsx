import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { VisibilityDialog } from './VisibilityDialog';
import { HiddenPill } from '@/components/StatusPill';
import { AppToastProvider } from '@/components/ToastProvider';
import type { SensorDto } from '@/api/hooks/sensors';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const sensor = (visible: boolean | undefined): SensorDto => ({ id: 7, name: 'Fan RMS', externalSensorId: 'fan_rms_1', visible }) as SensorDto;

function renderDialog(s: SensorDto, onClose = () => undefined) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <VisibilityDialog deviceId={4} sensor={s} open onClose={onClose} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const ok = () => new Response(JSON.stringify({ id: 7 }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('VisibilityDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('hides a visible Sensor: says what it does and does not do, and sends only { visible: false }', async () => {
    const calls: { method: string; path: string; body: unknown }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      calls.push({ method: request.method, path: new URL(request.url).pathname, body: request.method === 'PUT' ? await request.clone().json() : undefined });
      return ok();
    });
    let closed = false;
    const user = userEvent.setup();
    renderDialog(sensor(true), () => {
      closed = true;
    });

    expect(screen.getByText('Hide Fan RMS?')).toBeInTheDocument();
    expect(screen.getByText(/no longer appear in Live Monitoring or in the Sensor pickers of Smart Analytics/)).toBeInTheDocument();
    expect(screen.getByText(/an Issue that involves it still shows it/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide Sensor' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([{ method: 'PUT', path: '/api/Devices/4/Sensors/7', body: { visible: false } }]);
  });

  it.each([false, undefined])('is "Show" for a hidden Sensor, and "Hide" when the flag is missing (older API: %s counts as visible only if undefined)', async (visible) => {
    fetchMock().mockImplementation(async () => ok());
    renderDialog(sensor(visible));

    if (visible === false) {
      expect(screen.getByText('Show Fan RMS again?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show Sensor' })).toBeInTheDocument();
    } else {
      expect(screen.getByText('Hide Fan RMS?')).toBeInTheDocument();
    }
  });

  it('shows the server\'s refusal and stays open', async () => {
    fetchMock().mockImplementation(async () => new Response(JSON.stringify('Forbidden'), { status: 403, headers: { 'content-type': 'application/json' } }));
    let closed = false;
    const user = userEvent.setup();
    renderDialog(sensor(true), () => {
      closed = true;
    });

    await user.click(screen.getByRole('button', { name: 'Hide Sensor' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Hide Sensor' })).toBeEnabled());
    expect(closed).toBe(false);
  });
});

describe('HiddenPill', () => {
  const pill = (visible: boolean | undefined | null) =>
    render(
      <FluentProvider theme={webLightTheme}>
        <HiddenPill visible={visible} />
      </FluentProvider>,
    );

  it('shows a labelled badge only for a Sensor that is hidden', () => {
    pill(false);
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it.each([true, undefined, null])('stays quiet when visible is %s (the default)', (value) => {
    pill(value);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});
