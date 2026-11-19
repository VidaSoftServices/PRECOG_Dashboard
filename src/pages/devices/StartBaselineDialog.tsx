import { useState } from 'react';
import { Checkbox, Field, MessageBar, MessageBarBody, Select, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DateTimeField } from '@/components/DateTimeField';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useStartBaseline } from '@/api/hooks/maintenance';
import type { SensorDto } from '@/api/hooks/sensors';
import { useT } from '@/lib/language';
import { NOTE_MAX_LENGTH } from './EndMaintenanceDialog';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

/** An instant this far in the past is a "past" baseline: the API recalculates the Sensors from there. */
const PAST_TOLERANCE_MS = 60_000;

/**
 * Starts a new baseline by hand, without maintenance mode (Admin): for a change of the machine's normal state that needed no maintenance (moved,
 * process changed). For every Sensor of the Device or for one; from now or from an instant in the past (then the Sensors are recalculated from
 * there; Issues are kept). The same warm-up follows as after a replacement. A Sensor in maintenance mode is left out by the API.
 */
export function StartBaselineDialog({ deviceId, sensors, open, onClose }: { deviceId: number; sensors: readonly SensorDto[]; open: boolean; onClose: () => void }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const start = useStartBaseline(deviceId);
  const [sensorId, setSensorId] = useState<number | 'all'>('all');
  const [at, setAt] = useState<Date | null>(new Date());
  const [note, setNote] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const noteTooLong = note.trim().length > NOTE_MAX_LENGTH;
  const inFuture = at !== null && at.getTime() > Date.now() + PAST_TOLERANCE_MS;
  const inPast = at !== null && at.getTime() < Date.now() - PAST_TOLERANCE_MS;

  const confirm = async () => {
    const result = await start.mutateAsync({
      sensorIds: sensorId === 'all' ? undefined : [sensorId],
      at: at ? at.toISOString() : undefined,
      note: note.trim() || undefined,
    });
    const count = result.sensorIds?.length ?? 0;
    const skipped = result.skippedSensorIds?.length ?? 0;
    toast.success(
      skipped > 0
        ? t('New baseline started for {0} Sensor(s); {1} in maintenance left out.', count, skipped)
        : t('New baseline started for {0} Sensor(s).', count),
    );
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title={t('Start a new baseline')}
      confirmLabel={t('Start the new baseline')}
      confirmDisabled={!acknowledged || at === null || inFuture || noteTooLong}
      busy={start.isPending}
      onConfirm={() => void confirm().catch(() => undefined)}
      onCancel={() => {
        if (!start.isPending) onClose();
      }}
    >
      <div className={styles.body}>
        <Text>
          {t('For a change of the machine’s normal state that needed no maintenance mode (moved, process changed). Exactly as after a replacement: during the warm-up the readings are measured against the previous baseline, then only the readings since this instant count.')}
        </Text>
        <Field label={t('Sensors')}>
          <Select value={String(sensorId)} onChange={(_, d) => setSensorId(d.value === 'all' ? 'all' : Number(d.value))}>
            <option value="all">{t('All Sensors ({0})', sensors.length)}</option>
            {sensors.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name || s.externalSensorId}
              </option>
            ))}
          </Select>
        </Field>
        <DateTimeField
          label={t('Starts at')}
          value={at}
          onChange={setAt}
          maxDate={new Date()}
          validationMessage={at === null ? t('Choose an instant.') : inFuture ? t('The instant may not be in the future.') : undefined}
        />
        {inPast && (
          <MessageBar intent="warning">
            <MessageBarBody>
              {t('The instant lies in the past: the Sensors are recalculated from there until now. Issues raised meanwhile are not deleted - review them by hand.')}
            </MessageBarBody>
          </MessageBar>
        )}
        <Field
          label={t('Note (optional)')}
          validationState={noteTooLong ? 'error' : 'none'}
          validationMessage={noteTooLong ? t('At most {0} characters.', NOTE_MAX_LENGTH) : undefined}
        >
          <Textarea value={note} onChange={(_, d) => setNote(d.value)} resize="vertical" />
        </Field>
        <Checkbox
          checked={acknowledged}
          onChange={(_, d) => setAcknowledged(d.checked === true)}
          label={t('I understand: this changes the baseline the Sensors are measured against.')}
        />
        {start.isError && <ErrorState error={start.error} />}
      </div>
    </ConfirmDialog>
  );
}
