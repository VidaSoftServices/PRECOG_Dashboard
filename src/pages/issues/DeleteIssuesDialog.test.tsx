import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DeleteIssuesDialog } from './DeleteIssuesDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

function renderDialog(ids: number[], reviewedCount: number, onDone: (d: number[]) => void = () => undefined, onClose: () => void = () => undefined) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <DeleteIssuesDialog deviceId={4} issueIds={ids} reviewedCount={reviewedCount} open onClose={onClose} onDone={onDone} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const ok = () => new Response(JSON.stringify({ issueId: 1, deviceId: 4, wasReviewed: false, membersReleased: 0, retrainingScheduledForDeviceIds: [] }), { status: 200, headers: { 'content-type': 'application/json' } });

describe('DeleteIssuesDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('needs the acknowledgement, warns about reviewed Issues, then sends one DELETE per Issue in order', async () => {
    const paths: string[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      paths.push(`${request.method} ${new URL(request.url).pathname}`);
      return ok();
    });
    let done: number[] = [];
    let closed = false;
    const user = userEvent.setup();
    renderDialog([5, 6, 7], 2, (d) => { done = d; }, () => { closed = true; });

    expect(screen.getByText(/2 of them were reviewed by a person/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete 3 Issue(s)' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /3 Issue\(s\) are deleted permanently/ }));
    await user.click(screen.getByRole('button', { name: 'Delete 3 Issue(s)' }));

    await waitFor(() => expect(closed).toBe(true));
    expect(paths).toEqual(['DELETE /api/Issue/5/Permanent', 'DELETE /api/Issue/6/Permanent', 'DELETE /api/Issue/7/Permanent']);
    expect(done).toEqual([5, 6, 7]);
  });

  it('stops at the first failure, reports what was deleted, and leaves the rest untouched', async () => {
    const paths: string[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      const path = new URL(request.url).pathname;
      paths.push(path);
      return path.includes('/6/') ? new Response('An Ollama job for this Issue is processing right now.', { status: 409, headers: { 'content-type': 'application/json' } }) : ok();
    });
    let done: number[] = [];
    let closed = false;
    const user = userEvent.setup();
    renderDialog([5, 6, 7], 0, (d) => { done = d; }, () => { closed = true; });

    await user.click(screen.getByRole('checkbox', { name: /deleted permanently/ }));
    await user.click(screen.getByRole('button', { name: 'Delete 3 Issue(s)' }));

    expect(await screen.findByText(/1 of 3 deleted; it stopped at the first error/)).toBeInTheDocument();
    expect(paths).toEqual(['/api/Issue/5/Permanent', '/api/Issue/6/Permanent']); // 7 was never tried
    expect(done).toEqual([5]);
    expect(closed).toBe(false);
  });
});
