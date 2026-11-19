import { useState } from 'react';
import { Checkbox, Field, MessageBar, MessageBarBody, Radio, RadioGroup, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useSetDeviceMaintenance, type MaintenanceKind } from '@/api/hooks/maintenance';
import { NOTE_MAX_LENGTH } from './EndMaintenanceDialog';
import type { SensorDto } from '@/api/hooks/sensors';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

type Choice = 'start' | 'end';

/**
 * "Maintenance (all Sensors)": switches maintenance mode on or off for EVERY Sensor of the Device in one request
 * (`PUT /api/Devices/{deviceId}/Maintenance` - a Device may have hundreds of Sensors, and the per-Sensor call is rate limited to 30 per
 * minute). Starting says plainly that data sent meanwhile is lost and needs an explicit acknowledgement; ending needs none. A choice
 * that would change nothing (everything already in maintenance, or nothing in maintenance) is disabled. Sensors that already have the
 * requested state are left untouched by the API. Ending asks what the maintenance was for every Sensor taken out of it (a replacement / repair
 * starts a new baseline, a minor maintenance does not) and needs an explicit confirmation too, as the single-Sensor end does. Company Admin only -
 * the button that opens this dialog is shown to an Admin only, and the server answers any non-Admin with 403 anyway.
 */
export function MaintenanceAllDialog({
  deviceId,
  sensors,
  open,
  onClose,
}: {
  deviceId: number;
  sensors: readonly SensorDto[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const setMaintenance = useSetDeviceMaintenance(deviceId);

  const total = sensors.length;
  const inMaintenance = sensors.filter((s) => s.maintenanceMode).length;
  const canStart = inMaintenance < total;
  const canEnd = inMaintenance > 0;
  // Nothing in maintenance: starting is the only sensible action; everything in maintenance: ending is. A mixed state asks.
  const defaultChoice: Choice | null = canStart && !canEnd ? 'start' : canEnd && !canStart ? 'end' : null;

  const [chosen, setChosen] = useState<Choice | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [kind, setKind] = useState<MaintenanceKind | null>(null);
  const [note, setNote] = useState('');
  const noteTooLong = note.trim().length > NOTE_MAX_LENGTH;
  const choice = chosen ?? defaultChoice;
  const starting = choice === 'start';
  const changing = starting ? total - inMaintenance : inMaintenance;

  const close = () => {
    if (setMaintenance.isPending) return;
    setChosen(null);
    setAcknowledged(false);
    setKind(null);
    setNote('');
    setMaintenance.reset();
    onClose();
  };

  const confirm = async () => {
    if (!choice) return;
    await setMaintenance.mutateAsync(starting ? { enabled: true } : { enabled: false, kind: kind!, note: note.trim() || undefined });
    toast.success(starting ? t('Maintenance started on {0} Sensor(s).', changing) : t('Maintenance ended on {0} Sensor(s).', changing));
    setChosen(null);
    setAcknowledged(false);
    setKind(null);
    setNote('');
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title={t('Maintenance mode: all Sensors')}
      intent={starting ? 'destructive' : 'normal'}
      confirmLabel={choice === null ? t('Apply') : starting ? t('Start maintenance on {0} Sensor(s)', changing) : t('End maintenance on {0} Sensor(s)', changing)}
      confirmDisabled={choice === null || !acknowledged || (!starting && (kind === null || noteTooLong))}
      busy={setMaintenance.isPending}
      onConfirm={() => void confirm().catch(() => undefined)}
      onCancel={close}
    >
      <div className={styles.body}>
        <Text>
          {inMaintenance} {t('of')}{' '}{total} {t('Sensor(s) of this Device are in maintenance mode now.')}</Text>
        <RadioGroup
          aria-label={t('Maintenance action for all Sensors')}
          value={choice ?? ''}
          onChange={(_, d) => {
            setChosen(d.value as Choice);
            setAcknowledged(false);
          }}
        >
          <Radio value="start" disabled={!canStart} label={t('Start maintenance on all Sensors ({0} not in maintenance yet)', total - inMaintenance)} />
          <Radio value="end" disabled={!canEnd} label={t('End maintenance on all Sensors ({0} in maintenance now)', inMaintenance)} />
        </RadioGroup>
        {starting && (
          <>
            <MessageBar intent="warning">
              <MessageBarBody>
                {t('While a Sensor is in maintenance, every value the Device sends for it is accepted but ignored: it is not stored and not analysed, so no Issue can be raised from it. Data sent during maintenance cannot be recovered afterwards.')}</MessageBarBody>
            </MessageBar>
            <Checkbox
              checked={acknowledged}
              onChange={(_, d) => setAcknowledged(d.checked === true)}
              label={t('I understand that telemetry of all these Sensors is lost while they are in maintenance.')}
            />
          </>
        )}
        {choice === 'end' && (
          <>
            <Text>{t('The Device’s values for these Sensors will be stored and analysed again from now on.')}</Text>
            <Text weight="semibold">{t('What was done on the machine?')}</Text>
            <RadioGroup
              aria-label={t('What was done on the machine?')}
              value={kind ?? ''}
              onChange={(_, d) => {
                setKind(d.value as MaintenanceKind);
                setAcknowledged(false);
              }}
            >
              <Radio value="Replacement" label={t('Replacement or repair - the machine’s normal state changed')} />
              <Radio value="Minor" label={t('Minor maintenance - the normal state did not change')} />
            </RadioGroup>
            {kind && (
              <Text size={200}>
                {kind === 'Replacement'
                  ? t('A new baseline starts now for every one of these Sensors: during the warm-up the readings are still measured against the baseline before the maintenance, then only the readings since the maintenance count.')
                  : t('The baseline stays; the charts only mark the maintenance with a blue dashed line.')}{' '}
                {t('The kind can be changed later in the maintenance history (the Sensor is then recalculated from the end of the maintenance).')}
              </Text>
            )}
            <Field
              label={t('Note (optional)')}
              validationState={noteTooLong ? 'error' : 'none'}
              validationMessage={noteTooLong ? t('At most {0} characters.', NOTE_MAX_LENGTH) : undefined}
            >
              <Textarea value={note} onChange={(_, d) => setNote(d.value)} resize="vertical" />
            </Field>
            {kind && (
              <Checkbox
                checked={acknowledged}
                onChange={(_, d) => setAcknowledged(d.checked === true)}
                label={kind === 'Replacement' ? t('I understand: this changes the baseline the Sensors are measured against.') : t('I understand: the baseline of the Sensors stays as it is.')}
              />
            )}
          </>
        )}
        {setMaintenance.isError && <ErrorState error={setMaintenance.error} />}
      </div>
    </ConfirmDialog>
  );
}
