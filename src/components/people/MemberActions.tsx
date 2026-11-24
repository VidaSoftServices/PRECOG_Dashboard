import { useState } from 'react';
import { Button, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components';
import { Delete16Regular } from '@fluentui/react-icons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  row: { display: 'flex', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap', alignItems: 'center' },
});

/** The action is supplied by the page (the Company Admin's and the platform administrator's endpoints differ only by the Company in the path). */
export interface MemberActionHandlers {
  /** Resolves with `deactivated` when the person had a history and was kept as a deactivated row. */
  remove: () => Promise<{ deactivated?: boolean } | undefined | void>;
}

interface MemberActionsProps {
  name: string;
  handlers: MemberActionHandlers;
}

/**
 * Remove a person from the Company. It asks first; a refusal of the API (the last Admin, a Company with Devices and no Admin, ...) is shown with its own text, translated.
 */
export function MemberActions({ name, handlers }: MemberActionsProps) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await handlers.remove();
      toast.success(result && result.deactivated ? t('{0} was removed (the history stays: the account was deactivated).', name) : t('{0} was removed.', name));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={styles.row}>
        <Button size="small" appearance="subtle" icon={<Delete16Regular />} onClick={() => setOpen(true)}>
          {t('Remove')}
        </Button>
      </div>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{t(error)}</MessageBarBody>
        </MessageBar>
      )}
      <ConfirmDialog open={open} title={t('Remove {0} from the company?', name)} intent="destructive" confirmLabel={t('Remove')} cancelLabel={t('Cancel')} busy={busy} onCancel={() => setOpen(false)} onConfirm={confirm}>
        {t('{0} can no longer sign in or reach this company.', name)}
      </ConfirmDialog>
    </>
  );
}
