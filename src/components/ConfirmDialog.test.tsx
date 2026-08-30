import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <FluentProvider theme={webLightTheme}>
      <ConfirmDialog open title="Revoke this credential?" onConfirm={onConfirm} onCancel={onCancel} {...props}>
        This cannot be undone.
      </ConfirmDialog>
    </FluentProvider>,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('renders as an accessible dialog with its title and body', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Revoke this credential?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is activated, and onCancel for cancel', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog({ confirmLabel: 'Revoke' });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape - the same dismissal path as clicking the Cancel button', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while busy, so a slow mutation cannot be double-submitted or cancelled mid-flight', () => {
    renderDialog({ busy: true, confirmLabel: 'Revoke' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /working/i })).toBeDisabled();
  });

  it('disables only the confirm button when confirmDisabled is set (e.g. no target selected yet)', () => {
    renderDialog({ confirmDisabled: true, confirmLabel: 'Move' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
  });

  it('moves focus into the dialog on open (Fluent Dialog\'s built-in focus trap)', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
