import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { MemberActions } from './MemberActions';
import { WordPressBadge } from './WordPressBadge';
import { AppToastProvider } from '@/components/ToastProvider';
import { setLanguage } from '@/lib/language';
import { ApiError } from '@/api/client';

function renderActions(props: Partial<React.ComponentProps<typeof MemberActions>> = {}) {
  const handlers = { remove: vi.fn().mockResolvedValue({ deactivated: false }), link: vi.fn().mockResolvedValue(undefined), unlink: vi.fn().mockResolvedValue(undefined) };
  render(
    <FluentProvider theme={webLightTheme}>
      <AppToastProvider>
        <MemberActions name="Rita Reader" fromWordPress={false} origin="Local" handlers={handlers} {...props} />
      </AppToastProvider>
    </FluentProvider>,
  );
  return handlers;
}

beforeEach(() => setLanguage('en'));

describe('MemberActions', () => {
  it('offers "Link to WordPress" to a locally managed person and "Unlink" to a WordPress one - never both', () => {
    renderActions({ fromWordPress: false, origin: 'Local' });
    expect(screen.getByRole('button', { name: 'Link to WordPress' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlink from WordPress' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('offers no link at all to an Entra ID person, and only "Unlink" to a WordPress one', () => {
    renderActions({ fromWordPress: false, origin: 'EntraId' });
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

  it('shows the refusal of the API in Hungarian: a person synchronized with WordPress cannot be removed', async () => {
    setLanguage('hu');
    const user = userEvent.setup();
    const handlers = renderActions({ fromWordPress: true });
    handlers.remove.mockRejectedValue(
      new ApiError({ status: 409, message: 'This User cannot be removed: it is synchronized with WordPress. Unlink it from WordPress first, or switch the synchronization off.' } as never),
    );

    await user.click(screen.getByRole('button', { name: 'Eltávolítás' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    await user.click(within(dialog).getByRole('button', { name: 'Eltávolítás', hidden: true }));

    expect(await screen.findByText(/nem távolítható el: szinkronban van a WordPress-szel/)).toBeInTheDocument();
  });

  it('unlinks and links only after a confirmation that explains where the password lives', async () => {
    const user = userEvent.setup();
    const handlers = renderActions({ fromWordPress: true });

    await user.click(screen.getByRole('button', { name: 'Unlink from WordPress' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(within(dialog).getByText(/manages the password here, not in WordPress/)).toBeInTheDocument();
    expect(handlers.unlink).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Unlink', hidden: true }));

    await waitFor(() => expect(handlers.unlink).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Rita Reader is now managed here.')).toBeInTheDocument();
  });

  it('links a locally managed person after a confirmation', async () => {
    const user = userEvent.setup();
    const handlers = renderActions({ fromWordPress: false, origin: 'Local' });

    await user.click(screen.getByRole('button', { name: 'Link to WordPress' }));
    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(within(dialog).getByText(/The password set here stops working/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Link', hidden: true }));

    await waitFor(() => expect(handlers.link).toHaveBeenCalledTimes(1));
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
