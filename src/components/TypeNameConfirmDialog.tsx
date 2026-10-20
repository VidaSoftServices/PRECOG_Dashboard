import { useState, type ReactNode } from 'react';
import { Field, Input, Text } from '@fluentui/react-components';
import { tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';

/**
 * The two-step confirmation used for the irreversible Device actions:
 *   1. a warning (what happens, that it cannot be undone) with a "Continue" button;
 *   2. the user has to TYPE the name exactly (case sensitive, not trimmed) - the confirm button stays disabled until it
 *      matches. The server checks the same name again, so the typed name is a second line of defence, not the only one.
 * The caller supplies the texts and performs the action in `onConfirm`; this component only owns the steps and the typed
 * value. Closing (Cancel / Escape) resets it, and is blocked while the action is running.
 */
export function TypeNameConfirmDialog({
  open,
  expectedName,
  warningTitle,
  warning,
  continueLabel = 'Continue…',
  confirmTitle = 'Type the device name to confirm',
  confirmPrompt,
  confirmLabel,
  nameFieldLabel = 'Device name',
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** The exact text the user must type. */
  expectedName: string;
  warningTitle: string;
  /** Step 1 body: the consequences. */
  warning: ReactNode;
  continueLabel?: string;
  confirmTitle?: string;
  /** Step 2 text above the input (the expected name is appended in bold). */
  confirmPrompt: string;
  confirmLabel: string;
  nameFieldLabel?: string;
  busy: boolean;
  error: unknown;
  /** Called with the typed name once it matches. */
  onConfirm: (typedName: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'warning' | 'confirm'>('warning');
  const [typed, setTyped] = useState('');

  const close = () => {
    if (busy) return;
    setStep('warning');
    setTyped('');
    onClose();
  };

  if (step === 'warning') {
    return (
      <ConfirmDialog open={open} title={warningTitle} intent="destructive" confirmLabel={continueLabel} onConfirm={() => setStep('confirm')} onCancel={close}>
        {warning}
      </ConfirmDialog>
    );
  }

  const matches = typed === expectedName;
  return (
    <ConfirmDialog
      open={open}
      title={confirmTitle}
      intent="destructive"
      confirmLabel={confirmLabel}
      busy={busy}
      confirmDisabled={!matches}
      onConfirm={() => onConfirm(typed)}
      onCancel={close}
    >
      <Text block>
        {confirmPrompt} <b>{expectedName}</b>
      </Text>
      <Field
        label={nameFieldLabel}
        style={{ marginTop: tokens.spacingVerticalM }}
        validationState={typed !== '' && !matches ? 'error' : 'none'}
        validationMessage={typed !== '' && !matches ? 'Does not match the device name (case sensitive).' : undefined}
      >
        <Input value={typed} onChange={(_, d) => setTyped(d.value)} autoComplete="off" disabled={busy} />
      </Field>
      {error != null && <ErrorState error={error} />}
    </ConfirmDialog>
  );
}
