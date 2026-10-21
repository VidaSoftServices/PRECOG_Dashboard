import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { IssueFeedbackEditor } from './IssueDetailPage';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

function renderEditor(message = 'Bearing noise', reviewed = false) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <IssueFeedbackEditor deviceId={4} issueId={12} message={message} reviewed={reviewed} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('IssueFeedbackEditor', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('shows the current feedback, saves only the message with PUT, and offers Revert', async () => {
    const calls: { method: string; url: string; body: Record<string, unknown> }[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      if (request.method === 'PUT') {
        calls.push({ method: request.method, url: request.url, body: (await request.clone().json()) as Record<string, unknown> });
        return new Response(JSON.stringify({ id: 12, message: 'Bearing noise, confirmed on site' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const user = userEvent.setup();
    renderEditor();

    const box = screen.getByRole('textbox', { name: /feedback/i });
    expect(box).toHaveValue('Bearing noise');
    expect(screen.getByRole('button', { name: 'Save feedback' })).toBeDisabled();

    await user.type(box, ', confirmed on site');
    expect(screen.getByRole('button', { name: 'Save feedback' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(box).toHaveValue('Bearing noise');

    await user.type(box, ', confirmed on site');
    await user.click(screen.getByRole('button', { name: 'Save feedback' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toContain('/api/Issue/12');
    // Only the message: never the verdict (confirmed) or the anomaly flag.
    expect(calls[0]!.body).toEqual({ message: 'Bearing noise, confirmed on site' });
  });

  it('refuses a text longer than the 440 characters the database holds, and says what the text does before a review', () => {
    renderEditor('', false);
    fireEvent.change(screen.getByRole('textbox', { name: /feedback/i }), { target: { value: 'x'.repeat(441) } });
    expect(screen.getByText('At most 440 characters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save feedback' })).toBeDisabled();
    expect(screen.getByText(/a new automatic analysis may replace this text/i)).toBeInTheDocument();
  });

  it('does not warn about replacement once the Issue is reviewed', () => {
    renderEditor('ok', true);
    expect(screen.queryByText(/may replace this text/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Kept as you wrote it/)).toBeInTheDocument();
  });
});
