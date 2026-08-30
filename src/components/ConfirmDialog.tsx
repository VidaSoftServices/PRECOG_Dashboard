import { useRef, type ReactNode } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@fluentui/react-components';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Plain description text, or richer content (e.g. a MessageBar for extra context) for a consequential action. */
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'destructive' switches the confirm button to a danger appearance - use for anything that can't be trivially undone (revoke, disable, withdraw). */
  intent?: 'normal' | 'destructive';
  busy?: boolean;
  /** Disables the confirm button independent of `busy` - e.g. no target selected yet. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The one reusable confirm/consequential-action dialog in this project - no
 * page uses `window.confirm` (see AGENTS.md's rule against native browser
 * dialogs, which give no styling, focus, or keyboard control and are
 * inconsistent with everything else in a Fluent UI application). Fluent's
 * `Dialog` already provides focus trapping and focus restoration to the
 * trigger on close; this component adds nothing on top of that except a
 * consistent shape (title/body/confirm/cancel/busy/destructive) so every
 * call site looks and behaves the same way.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  intent = 'normal',
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Fluent's Dialog restores focus to whatever triggered it automatically on
  // close; nothing extra is needed here beyond not stealing focus ourselves.
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onCancel()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{children}</DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button
              ref={confirmButtonRef}
              appearance={intent === 'destructive' ? 'primary' : 'primary'}
              style={intent === 'destructive' ? { backgroundColor: 'var(--colorPaletteRedBackground3)' } : undefined}
              onClick={onConfirm}
              disabled={busy || confirmDisabled}
            >
              {busy ? 'Working…' : confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
