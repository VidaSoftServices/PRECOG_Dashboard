import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DeleteIssueDialog } from './DeleteIssueDialog';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

function renderDialog(props: { reviewed: boolean; isCanonical?: boolean; memberCount?: number }, onDeleted = () => undefined, onClose = () => undefined) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <DeleteIssueDialog
            deviceId={4}
            issueId={77}
            issueKey={12}
            reviewed={props.reviewed}
            isCanonical={props.isCanonical ?? false}
            memberCount={props.memberCount ?? 0}
            open
            onClose={onClose}
            onDeleted={onDeleted}
          />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('DeleteIssueDialog', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('an unreviewed Issue: says it is permanent, needs no acknowledgement, and sends DELETE .../Permanent, then reports back', async () => {
    const calls: { method: string; path: string }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      calls.push({ method: request.method, path: new URL(request.url).pathname });
      return ok({ issueId: 77, deviceId: 4, wasReviewed: false, membersReleased: 0, retrainingScheduledForDeviceIds: [] });
    });
    let deleted = false;
    const user = userEvent.setup();
    renderDialog({ reviewed: false }, () => {
      deleted = true;
    });

    expect(screen.getByText('Delete Issue #12 permanently?')).toBeInTheDocument();
    expect(screen.getByText(/It cannot be undone/)).toBeInTheDocument();
    expect(screen.getByText(/Reopen for\s+review/)).toBeInTheDocument(); // points to the non-destructive alternative
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Issue' }));

    await waitFor(() => expect(deleted).toBe(true));
    expect(calls).toEqual([{ method: 'DELETE', path: '/api/Issue/77/Permanent' }]);
  });

  it('a reviewed Issue is a training example: the button stays disabled until the retraining is acknowledged', async () => {
    fetchMock().mockImplementation(async () => ok({ issueId: 77, deviceId: 4, wasReviewed: true, membersReleased: 0, retrainingScheduledForDeviceIds: [4] }));
    let deleted = false;
    const user = userEvent.setup();
    renderDialog({ reviewed: true }, () => {
      deleted = true;
    });

    expect(screen.getByText(/it is a training example/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Issue' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /removed from training and retraining is started/ }));
    await user.click(screen.getByRole('button', { name: 'Delete Issue' }));

    await waitFor(() => expect(deleted).toBe(true));
  });

  it('a canonical Issue says that its members become standalone, not deleted', () => {
    renderDialog({ reviewed: false, isCanonical: true, memberCount: 3 });
    expect(screen.getByText(/its 3 member Issue\(s\) are not deleted, they become standalone Issues again/)).toBeInTheDocument();
  });

  it('shows the server refusal and stays open instead of pretending it worked', async () => {
    fetchMock().mockImplementation(
      async () => new Response('An Ollama job for this Issue is processing right now.', { status: 409, headers: { 'content-type': 'application/json' } }),
    );
    let deleted = false;
    const user = userEvent.setup();
    renderDialog({ reviewed: false }, () => {
      deleted = true;
    });

    await user.click(screen.getByRole('button', { name: 'Delete Issue' }));

    expect(await screen.findByText(/Ollama job for this Issue is processing/)).toBeInTheDocument();
    expect(deleted).toBe(false);
  });
});
