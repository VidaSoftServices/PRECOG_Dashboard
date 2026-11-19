import { useState } from 'react';
import { Checkbox, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useDeleteIssuePermanently } from '@/api/hooks/issues';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

/**
 * "Delete Issue": permanent and irreversible, so it always goes through this confirmation. It says what is removed and what is kept; for an Issue a
 * person has reviewed (a training example) it also warns that retraining is started and needs an explicit acknowledgement; for a canonical Issue it says
 * that the members of its group become standalone Issues (they are not deleted). Company Admin only - the button that opens it is shown to an Admin only,
 * and the server answers any non-Admin with 403 (shown inside the dialog, which then stays open).
 */
export function DeleteIssueDialog({
  deviceId,
  issueId,
  issueKey,
  reviewed,
  isCanonical,
  memberCount,
  open,
  onClose,
  onDeleted,
}: {
  deviceId: number;
  issueId: number;
  issueKey?: number;
  reviewed: boolean;
  isCanonical: boolean;
  /** Members shown in the Issue's group (0 for a standalone or member Issue). */
  memberCount: number;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const remove = useDeleteIssuePermanently(deviceId);
  const [acknowledged, setAcknowledged] = useState(false);

  const close = () => {
    if (remove.isPending) return;
    setAcknowledged(false);
    remove.reset();
    onClose();
  };

  const confirm = async () => {
    const result = await remove.mutateAsync(issueId);
    const retrained = result.retrainingScheduledForDeviceIds?.length ?? 0;
    toast.success(t('Issue #{0} deleted{1}.', issueKey ?? issueId, retrained > 0 ? `; retraining requested for ${retrained} Device(s)` : ''));
    setAcknowledged(false);
    onDeleted();
  };

  return (
    <ConfirmDialog
      open={open}
      title={t('Delete Issue #{0} permanently?', issueKey ?? issueId)}
      intent="destructive"
      confirmLabel="Delete Issue"
      confirmDisabled={reviewed && !acknowledged}
      busy={remove.isPending}
      onConfirm={() => void confirm().catch(() => undefined)}
      onCancel={close}
    >
      <div className={styles.body}>
        <Text>
          {t('This permanently deletes the Issue with its category suggestion, Ollama summary and knowledge-share selections. It cannot be undone. The measured values, the calculated values and the model history are not touched. To keep the Issue and only take back the verdict, use “Reopen for review” instead.')}</Text>
        {isCanonical && memberCount > 0 && (
          <MessageBar intent="info">
            <MessageBarBody>
              {t('This is the canonical Issue of a group: its')}{' '}{memberCount} {t('member Issue(s) are not deleted, they become standalone Issues again.')}</MessageBarBody>
          </MessageBar>
        )}
        {reviewed && (
          <>
            <MessageBar intent="warning">
              <MessageBarBody>
                {t('A person has reviewed this Issue, so it is a training example. Deleting it removes that example: retraining is requested for this Device and for every Device that receives it through an approved knowledge share.')}</MessageBarBody>
            </MessageBar>
            <Checkbox
              checked={acknowledged}
              onChange={(_, d) => setAcknowledged(d.checked === true)}
              label={t('I understand that this reviewed Issue is removed from training and retraining is started.')}
            />
          </>
        )}
        {remove.isError && <ErrorState error={remove.error} />}
      </div>
    </ConfirmDialog>
  );
}
