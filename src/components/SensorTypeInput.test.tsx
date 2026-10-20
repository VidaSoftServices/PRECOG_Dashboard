import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, Field, webLightTheme } from '@fluentui/react-components';
import { SensorTypeInput } from './SensorTypeInput';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

/**
 * Render-level checks only. Opening a Fluent Combobox popup hangs under jsdom (floating-ui positioning against jsdom's
 * zero layout - see MoveToCanonicalDialog.test.tsx), so the dropdown interaction is verified in a real browser, and the
 * choice of which types to offer is covered by sensorTypes.test.ts.
 */
function renderInput(respond: () => Response, value = 'temperature') {
  fetchMock().mockImplementation(async () => respond());
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <Field label="Sensor type">
          <SensorTypeInput value={value} onChange={() => undefined} />
        </Field>
      </QueryClientProvider>
    </FluentProvider>,
  );
  return queryClient;
}

/** Waits until the suggestions request was made. (Never `expect(fetchMock())`: a failing matcher tries to print the whole mock, Requests included, and hangs.) */
const fetched = () =>
  waitFor(() => {
    if (fetchMock().mock.calls.length === 0) throw new Error('suggestions not requested yet');
  });

describe('SensorTypeInput (render)', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('is a labelled combobox showing the current value', async () => {
    renderInput(() => new Response(JSON.stringify(['humidity', 'temperature']), { status: 200, headers: { 'content-type': 'application/json' } }));

    const input = await screen.findByRole('combobox', { name: 'Sensor type' });
    expect((input as HTMLInputElement).value).toBe('temperature');
  });

  it('loads the suggestions once, from GET /api/SensorTypes', async () => {
    renderInput(() => new Response(JSON.stringify(['humidity']), { status: 200, headers: { 'content-type': 'application/json' } }));

    await fetched();
    expect(fetchMock().mock.calls.length).toBe(1);
    const request = fetchMock().mock.calls[0]![0] as Request;
    expect(request.method).toBe('GET');
    expect(new URL(request.url).pathname).toBe('/api/SensorTypes');
  });

  it('is still a usable text box when the suggestions cannot be loaded', async () => {
    renderInput(() => new Response('boom', { status: 500 }), 'my own type');

    await fetched();
    const input = await screen.findByRole('combobox', { name: 'Sensor type' });
    expect((input as HTMLInputElement).value).toBe('my own type');
    expect(input).toBeEnabled();
    expect((input as HTMLInputElement).readOnly).toBe(false);
  });
});
