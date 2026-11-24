import { useState } from 'react';
import { Button, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components';
import { Delete16Regular, Link16Regular, LinkDismiss16Regular } from '@fluentui/react-icons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  row: { display: 'flex', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap', alignItems: 'center' },
});

/** The actions are supplied by the page (the Company Admin's and the platform administrator's endpoints differ only by the Company in the path). */
export interface MemberActionHandlers {
  /** Resolves with `deactivated` when the person had a history and was kept as a deactivated row. */
  remove: () => Promise<{ deactivated?: boolean } | undefined | void>;
  link: () => Promise<unknown>;
  unlink: () => Promise<unknown>;
}

interface MemberActionsProps {
  name: string;
  /** True for a User synchronized from WordPress (marked with the WordPress badge). */
  fromWordPress: boolean;
  /** Only a locally managed User can be linked to WordPress. */
  origin?: string | null;
  handlers: MemberActionHandlers;
}

type Pending = 'remove' | 'link' | 'unlink' | null;

/**
 * Remove a person from the Company, and decide where they manage the password: unlink from WordPress (here from now on) or link to it (WordPress from now on).
 * Every action asks first; a refusal of the API (a User synchronized from WordPress while the sync is on, the last Admin, ...) is shown with its own text, translated.
 */
export function MemberActions({ name, fromWordPress, origin, handlers }: MemberActionsProps) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => setPending(null);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending === 'remove') {
        const result = await handlers.remove();
        toast.success(result && result.deactivated ? t('{0} was removed (the history stays: the account was deactivated).', name) : t('{0} was removed.', name));
      } else if (pending === 'link') {
        await handlers.link();
        toast.success(t('{0} is now linked to WordPress.', name));
      } else {
        await handlers.unlink();
        toast.success(t('{0} is now managed here.', name));
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      close();
    } finally {
      setBusy(false);
    }
  };

  const title =
    pending === 'remove' ? t('Remove {0} from the company?', name) : pending === 'link' ? t('Link {0} to WordPress?', name) : t('Unlink {0} from WordPress?', name);
  const body =
    pending === 'remove'
      ? t('{0} can no longer sign in or reach this company.', name)
      : pending === 'link'
        ? t('WordPress becomes the place where {0} manages the password. The password set here stops working; the WordPress one is used.', name)
        : t('From now on {0} manages the password here, not in WordPress. The password copied last keeps working until it is changed.', name);

  return (
    <>
      <div className={styles.row}>
        {fromWordPress ? (
          <Button size="small" appearance="subtle" icon={<LinkDismiss16Regular />} onClick={() => setPending('unlink')}>
            {t('Unlink from WordPress')}
          </Button>
        ) : (
          origin === 'Local' && (
            <Button size="small" appearance="subtle" icon={<Link16Regular />} onClick={() => setPending('link')}>
              {t('Link to WordPress')}
            </Button>
          )
        )}
        <Button size="small" appearance="subtle" icon={<Delete16Regular />} onClick={() => setPending('remove')}>
          {t('Remove')}
        </Button>
      </div>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{t(error)}</MessageBarBody>
        </MessageBar>
      )}
      <ConfirmDialog
        open={pending !== null}
        title={title}
        intent={pending === 'remove' ? 'destructive' : 'normal'}
        confirmLabel={pending === 'remove' ? t('Remove') : pending === 'link' ? t('Link') : t('Unlink')}
        cancelLabel={t('Cancel')}
        busy={busy}
        onCancel={close}
        onConfirm={confirm}
      >
        {body}
      </ConfirmDialog>
    </>
  );
}
