import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DeleteSetpointsDialog } from './DeleteSetpointsDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const SETPOINTS = [
  { id: 13, validFrom: '2026-01-20T00:00:00Z', validTo: null, target: 7, tolerance: 2 },
  { id: 12, validFrom: '2026-01-10T00:00:00Z', validTo: '2026-01-20T00:00:00Z', target: 6, tolerance: 1 },
  { id: 11, validFrom: '2026-01-01T00:00:00Z', validTo: '2026-01-10T00:00:00Z', target: 5, tolerance: 1 },
];

function renderDialog(onClose = () => undefined) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <DeleteSetpointsDialog deviceId={4} sensorId={9} setpoints={SETPOINTS} open onClose={onClose} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('DeleteSetpointsDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('deletes only the picked intervals, one request each, after the confirmation button is enabled by a pick', async () => {
    const deleted: string[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      if (request.method === 'DELETE') {
        deleted.push(new URL(request.url).pathname);
        return new Response(null, { status: 204 });
      }
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    let closed = false;
    const user = userEvent.setup();
    renderDialog(() => {
      closed = true;
    });

    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled(); // nothing picked yet
    const group = screen.getByRole('group', { name: 'Setpoints to delete' });
    expect(group).toHaveTextContent('open-ended');

    await user.click(screen.getAllByRole('checkbox', { name: /2026-01-10/ })[0]!);
    await user.click(screen.getAllByRole('checkbox', { name: /2026-01-01/ })[0]!);
    await user.click(screen.getByRole('button', { name: 'Delete 2 setpoint(s)' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(deleted.sort()).toEqual(['/api/Devices/4/Sensors/9/Setpoints/11', '/api/Devices/4/Sensors/9/Setpoints/12']);
  });

  it('"Select all" picks every interval; a failed deletion is listed and the dialog stays open', async () => {
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      if (request.method === 'DELETE' && request.url.endsWith('/12')) return new Response(JSON.stringify('Setpoint not found.'), { status: 404, headers: { 'content-type': 'application/json' } });
      if (request.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    let closed = false;
    const user = userEvent.setup();
    renderDialog(() => {
      closed = true;
    });

    await user.click(screen.getByRole('checkbox', { name: 'Select all (3)' }));
    await user.click(screen.getByRole('button', { name: 'Delete 3 setpoint(s)' }));

    expect(await screen.findByText(/1 deletion\(s\) failed/)).toBeInTheDocument();
    expect(closed).toBe(false);
  });
});
