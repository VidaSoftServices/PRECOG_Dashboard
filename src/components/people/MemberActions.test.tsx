import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { MemberActions } from './MemberActions';
import { WordPressBadge } from './WordPressBadge';
import { AppToastProvider } from '@/components/ToastProvider';
import { setLanguage } from '@/lib/language';
import { ApiError } from '@/api/client';

function renderActions() {
  const handlers = { remove: vi.fn().mockResolvedValue({ deactivated: false }) };
  render(
    <FluentProvider theme={webLightTheme}>
      <AppToastProvider>
        <MemberActions name="Rita Reader" handlers={handlers} />
      </AppToastProvider>
    </FluentProvider>,
  );
  return handlers;
}

beforeEach(() => setLanguage('en'));

describe('MemberActions', () => {
  it('offers only "Remove" - nothing about WordPress', () => {
    renderActions();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /WordPress/ })).toBeNull();
  });

  it('asks before removing, then removes and says so', async () => {
    const user = userEvent.setup();
    const handlers = renderActions();

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(within(dialog).getByText(/can no longer sign in or reach this company/)).toBeInTheDocument();
    expect(handlers.remove).not.toHaveBeenCalled();                    // nothing before the confirmation

    await user.click(within(dialog).getByRole('button', { name: 'Remove', hidden: true }));

    await waitFor(() => expect(handlers.remove).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Rita Reader was removed.')).toBeInTheDocument();
  });

  it('says that the history stays when the person was deactivated instead of deleted', async () => {
    const user = userEvent.setup();
    const handlers = renderActions();
    handlers.remove.mockResolvedValue({ deactivated: true });

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await user.click(within(dialog).getByRole('button', { name: 'Remove', hidden: true }));

    expect(await screen.findByText(/the history stays: the account was deactivated/)).toBeInTheDocument();
  });

  it('shows the refusal of the API in Hungarian: the last Admin cannot be removed', async () => {
    setLanguage('hu');
    const user = userEvent.setup();
    const handlers = renderActions();
    handlers.remove.mockRejectedValue(
      new ApiError({ status: 409, message: 'This User is the last Admin of the Company, so it cannot be removed: make someone else an Admin first.' } as never),
    );

    await user.click(screen.getByRole('button', { name: 'Eltávolítás' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await user.click(within(dialog).getByRole('button', { name: 'Eltávolítás', hidden: true }));

    expect(await screen.findByText(/a cég utolsó Adminja, ezért nem távolítható el/)).toBeInTheDocument();
  });
});

describe('WordPressBadge', () => {
  it('is an icon and a text, in both languages', () => {
    const { rerender } = render(
      <FluentProvider theme={webLightTheme}>
        <WordPressBadge />
      </FluentProvider>,
    );
    expect(screen.getByText('WordPress')).toBeInTheDocument();
    setLanguage('hu');
    rerender(
      <FluentProvider theme={webLightTheme}>
        <WordPressBadge />
      </FluentProvider>,
    );
    expect(screen.getByText('WordPress')).toBeInTheDocument();
  });
});
