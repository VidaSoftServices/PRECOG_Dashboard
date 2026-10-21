import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { NewPolicyForm } from './SensorPoliciesPage';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';
import { AGGREGATION_FUNCTION_OPTIONS, SCALE_OPTIONS, TIME_SCALE_OPTIONS, timeZoneOptions } from '@/lib/aggregationOptions';

function renderForm() {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <NewPolicyForm deviceId={4} sensorId={9} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('aggregation level options', () => {
  it('offer only values the system knows: no Native / Raw, unique, 16 time scales', () => {
    expect(TIME_SCALE_OPTIONS).toHaveLength(16);
    expect(TIME_SCALE_OPTIONS.map((o) => o.value)).not.toContain('Native');
    // The shortest slice is 15 seconds (no millisecond or one-second slices); 12 hours is offered.
    expect(TIME_SCALE_OPTIONS[0]).toEqual({ value: 'Seconds15', label: '15 seconds' });
    expect(TIME_SCALE_OPTIONS.map((o) => o.value)).toEqual(expect.arrayContaining(['Hours12']));
    expect(TIME_SCALE_OPTIONS.map((o) => o.value)).not.toEqual(expect.arrayContaining(['Milliseconds']));
    expect(TIME_SCALE_OPTIONS.map((o) => o.value)).not.toEqual(expect.arrayContaining(['Seconds']));
    expect(AGGREGATION_FUNCTION_OPTIONS.map((o) => o.value)).not.toContain('Raw');
    for (const list of [TIME_SCALE_OPTIONS, AGGREGATION_FUNCTION_OPTIONS, SCALE_OPTIONS, timeZoneOptions()]) {
      expect(new Set(list.map((o) => o.value)).size).toBe(list.length);
    }
  });

  it('time zones start with UTC and are IANA names', () => {
    const zones = timeZoneOptions();
    expect(zones[0]).toEqual({ value: 'UTC', label: 'UTC (default)' });
    expect(zones.some((z) => z.value === 'Europe/Budapest')).toBe(true);
  });
});

describe('NewPolicyForm', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('has dropdowns only - no free text for source, time scale, function, scale or time zone - and never asks for the data key', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Add aggregation level' }));

    expect(screen.queryByLabelText(/source data key/i)).not.toBeInTheDocument();
    for (const name of ['Time scale', 'Aggregation function', 'Scale', 'Time zone']) {
      expect(screen.getByRole('combobox', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('combobox', { name: /^Time zone/ })).toHaveValue('UTC');
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('sends the chosen values with the data key Actual and the chosen time zone', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      if (request.method === 'POST') {
        calls.push({ url: request.url, body: (await request.clone().json()) as Record<string, unknown> });
        return new Response(JSON.stringify({ id: 1 }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Add aggregation level' }));

    await user.selectOptions(screen.getByRole('combobox', { name: /^Time scale/ }), 'Hours4');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Aggregation function/ }), 'MAX');
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Lookback/ }), { target: { value: '30' } });
    await user.selectOptions(screen.getByRole('combobox', { name: /^Scale/ }), 'Days');
    await user.selectOptions(screen.getByRole('combobox', { name: /^Time zone/ }), 'Europe/Budapest');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toContain('/api/Devices/4/Sensors/9/AggregationPolicies');
    expect(calls[0]!.body).toMatchObject({
      sourceDataKey: 'Actual',
      timeScale: 'Hours4',
      aggregationFunction: 'MAX',
      scale: 'Days',
      lookback: 30,
      timeZone: 'Europe/Budapest',
    });
  });
});
