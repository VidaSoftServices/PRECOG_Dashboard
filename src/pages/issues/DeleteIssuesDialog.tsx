import { useState } from 'react';
import { Checkbox, MessageBar, MessageBarBody, ProgressBar, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useDeleteIssuePermanently } from '@/api/hooks/issues';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

/**
 * "Delete selected" on the Issue list: permanently deletes several Issues, ONE REQUEST EACH (`DELETE /api/Issue/{id}/Permanent`, in the order
 * listed), and stops at the first failure - what was deleted stays deleted, the error is shown and the rest is left untouched. Always confirmed and
 * always acknowledged (it is irreversible); the warning counts how many of the selected Issues were reviewed by a person (training examples: deleting
 * them requests retraining on the server). Company Admin only - the button that opens this is shown to an Admin only.
 */
export function DeleteIssuesDialog({
  deviceId,
  issueIds,
  reviewedCount,
  open,
  onClose,
  onDone,
}: {
  deviceId: number;
  issueIds: readonly number[];
  /** How many of the selected Issues carry a human review verdict. */
  reviewedCount: number;
  open: boolean;
  onClose: () => void;
  /** Called with the ids that were really deleted (also after a failure part-way). */
  onDone: (deleted: number[]) => void;
}) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const remove = useDeleteIssuePermanently(deviceId);
  const [acknowledged, setAcknowledged] = useState(false);
  const [done, setDone] = useState(0);
  const [failure, setFailure] = useState<unknown>(null);
  const [running, setRunning] = useState(false);

  const close = () => {
    if (running) return;
    setAcknowledged(false);
    setDone(0);
    setFailure(null);
    onClose();
  };

  const confirm = async () => {
    setRunning(true);
    setFailure(null);
    setDone(0);
    const deleted: number[] = [];
    try {
      for (const id of issueIds) {
        await remove.mutateAsync(id);
        deleted.push(id);
        setDone(deleted.length);
      }
      toast.success(t('{0} Issue(s) deleted{1}.', deleted.length, reviewedCount > 0 ? '; retraining was requested for the reviewed ones' : ''));
    } catch (error) {
      setFailure(error);
      if (deleted.length > 0) toast.info(t('{0} of {1} Issue(s) were deleted before the error.', deleted.length, issueIds.length));
    } finally {
      setRunning(false);
    }
    if (deleted.length > 0) onDone(deleted);
    if (deleted.length === issueIds.length) {
      setAcknowledged(false);
      setDone(0);
      onClose();
    }
  };

  return (
    <ConfirmDialog
      open={open}
      title={t('Delete {0} Issue(s) permanently?', issueIds.length)}
      intent="destructive"
      confirmLabel={t('Delete {0} Issue(s)', issueIds.length)}
      confirmDisabled={!acknowledged || issueIds.length === 0}
      busy={running}
      onConfirm={() => void confirm()}
      onCancel={close}
    >
      <div className={styles.body}>
        <Text>
          {t('Each selected Issue is deleted permanently, with its category suggestion, Ollama summary and knowledge-share selections. It cannot be undone. Measured and calculated values and model history are not touched. Members of a deleted canonical Issue’s group become standalone Issues.')}</Text>
        {reviewedCount > 0 && (
          <MessageBar intent="warning">
            <MessageBarBody>
              {reviewedCount === 1
                ? t('1 of them was reviewed by a person and is a training example: deleting it requests retraining for this Device and for the Devices that receive it through an approved knowledge share.')
                : t('{0} of them were reviewed by a person and are training examples: deleting them requests retraining for this Device and for the Devices that receive them through an approved knowledge share.', reviewedCount)}</MessageBarBody>
          </MessageBar>
        )}
        <Checkbox
          checked={acknowledged}
          onChange={(_, d) => setAcknowledged(d.checked === true)}
          label={t('I understand that these {0} Issue(s) are deleted permanently.', issueIds.length)}
        />
        {running && <ProgressBar value={issueIds.length ? done / issueIds.length : 0} aria-label={t('Deleting Issues')} />}
        {failure !== null && (
          <>
            <Text>{done} {t('of')}{' '}{issueIds.length} {t('deleted; it stopped at the first error and left the rest untouched.')}</Text>
            <ErrorState error={failure} />
          </>
        )}
      </div>
    </ConfirmDialog>
  );
}
