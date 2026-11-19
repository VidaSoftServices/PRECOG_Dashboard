import { useState } from 'react';
import { Checkbox, MessageBar, MessageBarBody, Radio, RadioGroup, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { useAppToast } from '@/components/ToastProvider';
import {
  useMaintenanceChangePreview,
  useUpdateMaintenance,
  type MaintenanceKind,
  type SensorMaintenanceRecordDto,
} from '@/api/hooks/maintenance';
import { formatDateTime } from '@/lib/dateTime';
import { useT } from '@/lib/language';
import { MaintenanceKindBadge } from './MaintenanceHistoryCard';

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
  muted: { color: tokens.colorNeutralForeground3 },
  issues: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, maxHeight: '160px', overflowY: 'auto' },
});

/**
 * Changes the kind of a finished maintenance (Admin): any entry of the history, however far back. Before the change the API's preview says what is
 * recalculated - from the end of this maintenance until now, the raw readings (or why not) and the aggregation levels, the later replacements whose
 * baselines follow - and lists the Sensor's Issues in that span: none is deleted or raised again, the Admin reviews them by hand. A checkbox confirms.
 */
export function ChangeMaintenanceKindDialog({
  deviceId,
  record,
  open,
  onClose,
}: {
  deviceId: number;
  record: SensorMaintenanceRecordDto;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const current = record.kind === 'Replacement' ? 'Replacement' : 'Minor';
  const [kind, setKind] = useState<MaintenanceKind>(current === 'Replacement' ? 'Minor' : 'Replacement');
  const [acknowledged, setAcknowledged] = useState(false);
  const changed = kind !== current;
  const preview = useMaintenanceChangePreview(deviceId, changed ? record.id : undefined, changed ? kind : undefined);
  const update = useUpdateMaintenance(deviceId);
  const kindName = (k: MaintenanceKind) => (k === 'Replacement' ? t('Replacement / repair') : t('Minor maintenance'));

  const confirm = async () => {
    const result = await update.mutateAsync({ id: record.id!, kind });
    toast.success(
      result.recalculating
        ? t('Kind changed to {0}; {1} is being recalculated from {2}.', kindName(kind), record.sensorName ?? '', formatDateTime(record.endedAt))
        : t('Kind changed to {0}.', kindName(kind)),
    );
    onClose();
  };

  const p = preview.data;
  return (
    <ConfirmDialog
      open={open}
      title={t('Change the kind of the maintenance')}
      confirmLabel={t('Change and recalculate')}
      confirmDisabled={!changed || !acknowledged || !p}
      busy={update.isPending}
      onConfirm={() => void confirm().catch(() => undefined)}
      onCancel={() => {
        if (!update.isPending) onClose();
      }}
    >
      <div className={styles.body}>
        <Text>
          {record.sensorName} · {formatDateTime(record.startedAt)}
          {record.manualBaseline ? '' : ` → ${formatDateTime(record.endedAt)}`}
        </Text>
        <div>
          <Text className={styles.muted}>{t('Now')}: </Text>
          <MaintenanceKindBadge record={record} />
        </div>
        <RadioGroup
          aria-label={t('New kind')}
          value={kind}
          onChange={(_, d) => {
            setKind(d.value as MaintenanceKind);
            setAcknowledged(false);
          }}
        >
          <Radio value="Replacement" disabled={current === 'Replacement'} label={t('Replacement or repair - the machine’s normal state changed')} />
          <Radio value="Minor" disabled={current === 'Minor'} label={t('Minor maintenance - the normal state did not change')} />
        </RadioGroup>

        {changed && preview.isLoading && <LoadingState label={t('Working out what is recalculated…')} />}
        {changed && preview.isError && <ErrorState error={preview.error} onRetry={() => preview.refetch()} />}
        {p && (
          <>
            <div className={styles.summary}>
              <Text className={styles.muted}>{t('Recalculated')}</Text>
              <Text weight="semibold">{t('{0} → now', formatDateTime(p.recalculateFrom))}</Text>
              <Text className={styles.muted}>{t('Raw readings')}</Text>
              <Text weight="semibold">{p.rawRecalculated ? t('{0} reading(s), analysed again in the background', p.readings ?? 0) : (p.rawNote ?? '')}</Text>
              <Text className={styles.muted}>{t('Aggregation levels')}</Text>
              <Text weight="semibold">{(p.levels ?? []).length > 0 ? (p.levels ?? []).join(', ') : t('none with calculation on')}</Text>
              {(p.laterReplacements ?? []).length > 0 && (
                <>
                  <Text className={styles.muted}>{t('Later baselines')}</Text>
                  <Text weight="semibold">
                    {t('{0} - recalculated too, their kind stays', (p.laterReplacements ?? []).map((r) => formatDateTime(r.endedAt)).join(', '))}
                  </Text>
                </>
              )}
            </div>
            <MessageBar intent="warning">
              <MessageBarBody>
                {(p.issues ?? []).length === 0
                  ? t('No Issue of this Sensor lies in the recalculated span.')
                  : t('{0} Issue(s) lie in the recalculated span. They are not deleted and not raised again: review them, and delete the ones the old baseline caused.', (p.issues ?? []).length)}
              </MessageBarBody>
            </MessageBar>
            {(p.issues ?? []).length > 0 && (
              <div className={styles.issues}>
                {(p.issues ?? []).map((i) => (
                  <RouterLink key={i.issueId} to={`/issues/${i.issueId}`} target="_blank" rel="noopener noreferrer">
                    #{i.issueKey} · {formatDateTime(i.measuredAtFrom)} · {i.level} · {i.reviewState}
                  </RouterLink>
                ))}
              </div>
            )}
            <Checkbox
              checked={acknowledged}
              onChange={(_, d) => setAcknowledged(d.checked === true)}
              label={t('I understand: everything of this Sensor from this maintenance on is recalculated.')}
            />
          </>
        )}
        {update.isError && <ErrorState error={update.error} />}
      </div>
    </ConfirmDialog>
  );
}
