import { useState } from 'react';
import { Checkbox, MessageBar, MessageBarBody, MessageBarTitle, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { useAppToast } from '@/components/ToastProvider';
import { useAggregationLevelDeletionPreview, useDeleteAggregationLevels, type AggregationLevelRef } from '@/api/hooks/aggregationPolicies';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  summary: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  list: { maxHeight: '180px', overflowY: 'auto', margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  muted: { color: tokens.colorNeutralForeground3 },
});

/** At most this many refused levels are listed by name. */
const MAX_LISTED = 50;

/**
 * Deletes aggregation levels PERMANENTLY (one from the Policies page, many from Bulk aggregation or a deletion sheet): the API's preview first says how
 * many levels, buckets and Issues go (and how many reviewed Issues - training examples, their deletion schedules retraining) and which levels are refused
 * (raw, in a knowledge share, an Ollama job busy, not found); the deletion needs an explicit checkbox. Nothing can be undone. Company Admin only.
 */
export function DeleteAggregationLevelsDialog({
  deviceId,
  levels,
  title,
  open,
  onClose,
  onDeleted,
}: {
  deviceId: number;
  levels: AggregationLevelRef[];
  title: string;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const preview = useAggregationLevelDeletionPreview(deviceId, open ? levels : null);
  const remove = useDeleteAggregationLevels(deviceId);
  const [acknowledged, setAcknowledged] = useState(false);
  const p = preview.data;
  const refused = (p?.items ?? []).filter((i) => i.outcome !== 'WillDelete');

  const confirm = async () => {
    const result = await remove.mutateAsync(levels);
    toast.success(
      t('{0} aggregation level(s) deleted with {1} bucket(s) and {2} Issue(s).', result.levels ?? 0, result.buckets ?? 0, result.issues ?? 0) +
        ((result.retrainingScheduledForDeviceIds ?? []).length > 0 ? ' ' + t('Retraining was scheduled (reviewed Issues were deleted).') : ''),
    );
    onDeleted?.();
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title={title}
      intent="destructive"
      confirmLabel={p ? t('Delete {0} level(s) permanently', p.levels ?? 0) : t('Delete permanently')}
      confirmDisabled={!p || (p.levels ?? 0) === 0 || !acknowledged}
      busy={remove.isPending}
      onConfirm={() => void confirm().catch(() => undefined)}
      onCancel={() => {
        if (!remove.isPending) onClose();
      }}
    >
      <div className={styles.body}>
        {preview.isLoading && <LoadingState label={t('Working out what is deleted…')} />}
        {preview.isError && <ErrorState error={preview.error} onRetry={() => preview.refetch()} />}
        {p && (
          <>
            <div className={styles.summary}>
              <Text className={styles.muted}>{t('Levels deleted')}</Text>
              <Text weight="semibold">{p.levels ?? 0}</Text>
              <Text className={styles.muted}>{t('Aggregated buckets')}</Text>
              <Text weight="semibold">{(p.buckets ?? 0).toLocaleString()}</Text>
              <Text className={styles.muted}>{t('Issues of these levels')}</Text>
              <Text weight="semibold">{t('{0} (of them reviewed: {1})', p.issues ?? 0, p.reviewedIssues ?? 0)}</Text>
              {refused.length > 0 && (
                <>
                  <Text className={styles.muted}>{t('Not deleted')}</Text>
                  <Text weight="semibold">{refused.length}</Text>
                </>
              )}
            </div>
            <MessageBar intent="error">
              <MessageBarBody>
                <MessageBarTitle>{t('This cannot be undone.')}</MessageBarTitle>
                {t('The levels, every aggregated value of them and every Issue they raised are deleted for good. The raw readings and the raw level stay; a level can be created again later (its history is then aggregated afresh, without the old Issues).')}
                {(p.reviewedIssues ?? 0) > 0 && ' ' + t('Reviewed Issues are training examples: deleting them schedules retraining of the Device.')}
              </MessageBarBody>
            </MessageBar>
            {refused.length > 0 && (
              <ul className={styles.list}>
                {refused.slice(0, MAX_LISTED).map((i) => (
                  <li key={i.index}>
                    <Text size={200}>
                      {i.externalSensorId ?? i.sensorName ?? (i.sensorId !== undefined && i.sensorId !== null ? t('Sensor {0}', i.sensorId) : '?')} {i.timeScale ?? ''}/{i.aggregationFunction ?? ''}: {i.message ?? i.outcome}
                    </Text>
                  </li>
                ))}
                {refused.length > MAX_LISTED && <li>{t('…and {0} more.', refused.length - MAX_LISTED)}</li>}
              </ul>
            )}
            {(p.levels ?? 0) > 0 && (
              <Checkbox
                checked={acknowledged}
                onChange={(_, d) => setAcknowledged(d.checked === true)}
                label={t('I understand: the levels, their values and their Issues are deleted permanently.')}
              />
            )}
          </>
        )}
        {remove.isError && <ErrorState error={remove.error} />}
      </div>
    </ConfirmDialog>
  );
}
