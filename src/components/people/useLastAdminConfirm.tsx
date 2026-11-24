import { useCallback, useState, type ReactElement } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { isLastAdminWithDevices } from '@/lib/platformPeople';
import { useT } from '@/lib/language';

/**
 * The platform administrator may take the last Admin away from a Company, but a Company that has Devices must be told first. `attempt(run)` calls
 * `run(false)`; when the API answers with that question (409), the returned `dialog` asks, and a "Continue" runs `run(true)`. Any other failure is
 * thrown to the caller (whose mutation shows it). Render `dialog` once in the page.
 */
export function useLastAdminConfirm(): { attempt: (run: (confirmLastAdmin: boolean) => Promise<unknown>) => Promise<void>; dialog: ReactElement } {
  const t = useT();
  const [pending, setPending] = useState<(() => Promise<unknown>) | null>(null);
  const [busy, setBusy] = useState(false);

  const attempt = useCallback(async (run: (confirmLastAdmin: boolean) => Promise<unknown>) => {
    try {
      await run(false);
    } catch (error) {
      if (!isLastAdminWithDevices(error)) throw error;
      setPending(() => () => run(true));
    }
  }, []);

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={t('This is the last Admin')}
      intent="destructive"
      confirmLabel={t('Continue')}
      cancelLabel={t('Cancel')}
      busy={busy}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (!pending) return;
        setBusy(true);
        pending()
          .catch(() => undefined)
          .finally(() => {
            setBusy(false);
            setPending(null);
          });
      }}
    >
      {t('This is the last Admin of a Company that has Devices. After this the Company keeps its Devices with nobody to administer them. The person stays, with no role.')}
    </ConfirmDialog>
  );

  return { attempt, dialog };
}
