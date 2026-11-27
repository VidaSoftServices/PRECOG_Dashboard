import { useMemo, useState } from 'react';
import { Checkbox, Field, MessageBar, MessageBarBody, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useStartRecalculation } from '@/api/hooks/recalculation';
import { isDeleteOnly, isRecalculable, parseSensorNameList } from '@/lib/recalculation';
import type { SensorDto } from '@/api/hooks/sensors';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  list: { margin: 0, paddingLeft: tokens.spacingHorizontalXL },
});

/**
 * "Recalc": deletes every calculated value of a Sensor (or of every Sensor of the Device) and every Issue that no person has reviewed.
 * With calculation ON it then lets the API evaluate the stored readings from the first one, in the live analysis's batches (since
 * 2026-11-19; before, one by one), so the result equals what the live analysis would have produced. With calculation OFF it only deletes (nothing is calculated; switching
 * calculation on later calculates everything). Confirmation is mandatory (it deletes calculated results and can run for a long time), and
 * the Device-wide run also needs an explicit acknowledgement. The percentage is shown on the Device page (`RecalculationProgress`).
 * Company Admin only - the buttons that open this dialog are shown to an Admin only, and the server answers any non-Admin with 403.
 */
export function RecalculateDialog({
  deviceId,
  sensor,
  sensors,
  open,
  onClose,
}: {
  deviceId: number;
  /** One Sensor, or omitted for every Sensor of the Device. */
  sensor?: SensorDto;
  sensors: readonly SensorDto[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const start = useStartRecalculation(deviceId);
  const [acknowledged, setAcknowledged] = useState(false);
  const [listText, setListText] = useState('');

  const single = sensor !== undefined;
  const label = sensor ? sensor.name || sensor.externalSensorId : '';
  // A Device-wide run can be limited to a pasted list of Sensors (names one per line, or a sheet with a SensorName column).
  const list = useMemo(() => parseSensorNameList(listText, sensors), [listText, sensors]);
  const listed = !single && listText.trim() !== '';
  const listProblem = listed && (list.ids.length === 0 || list.unknown.length > 0);
  const eligible = (listed ? sensors.filter((s) => s.id != null && list.ids.includes(s.id)) : sensors).filter(isRecalculable);
  const deleteOnly = eligible.filter(isDeleteOnly).length;
  const recalculated = eligible.length - deleteOnly;
  const left = sensors.length - eligible.length;
  const singleDeleteOnly = sensor !== undefined && isDeleteOnly(sensor);

  const close = () => {
    if (start.isPending) return;
    setAcknowledged(false);
    setListText('');
    start.reset();
    onClose();
  };

  const confirm = async () => {
    const started = await start.mutateAsync(listed ? { sensorIds: list.ids } : (sensor?.id ?? undefined));
    const skipped = started.skipped?.length ?? 0;
    const onlyDeleted = started.deleteOnlySensorIds?.length ?? 0;
    let message = t('Recalculation started on {0} Sensor(s){1}{2}.', started.sensorIds?.length ?? 0, onlyDeleted > 0 ? ` (${onlyDeleted} only deleted)` : '', skipped > 0 ? `; ${skipped} left out` : '');
    if (singleDeleteOnly) message = t('Deleting the calculated values: {0}', label);
    else if (single) message = t('Recalculation started: {0}', label);
    toast.success(message);
    setAcknowledged(false);
    setListText('');
    onClose();
  };

  let confirmLabel = t('Recalculate {0} Sensor(s)', eligible.length);
  if (singleDeleteOnly) confirmLabel = t('Delete');
  else if (single) confirmLabel = t('Recalculate');

  let title = listed ? t('Recalculate the listed Sensors from the start?') : t('Recalculate all Sensors from the start?');
  if (singleDeleteOnly) title = t('Delete the calculated values of {0}?', label);
  else if (single) title = t('Recalculate {0} from the start?', label);

  let intro = listed
    ? t('Everything calculated for the {0} listed Sensor(s) is deleted. Sensors with calculation on are calculated again, starting from each Sensor’s first stored value. The other Sensors of this Device are not touched.', eligible.length)
    : t('Everything calculated for {0} Sensor(s) of this Device is deleted. Sensors with calculation on are calculated again, starting from each Sensor’s first stored value.', eligible.length);
  if (singleDeleteOnly)
    intro =
      t('The raw calculation of this Sensor is switched off, so its raw calculated values and unreviewed raw Issues are only deleted - nothing is calculated (this frees their space). The aggregation levels are not touched. Switching the raw calculation on later calculates everything again.');
  else if (single) intro = t('Everything calculated for this Sensor is deleted and calculated again, starting from its first stored value.');

  return (
    <ConfirmDialog
      open={open}
      title={title}
      intent="destructive"
      confirmLabel={confirmLabel}
      confirmDisabled={!single && (!acknowledged || eligible.length === 0 || listProblem)}
      busy={start.isPending}
      onConfirm={() => void confirm().catch(() => undefined)}
      onCancel={close}
    >
      <div className={styles.body}>
        <Text>{intro}</Text>
        <div>
          <Text weight="semibold">{t('Deleted first')}</Text>
          <ul className={styles.list}>
            {singleDeleteOnly ? (
              <li>{t('the calculated values: analysis results, anomaly scores and the control limits (UCL3, UCL2, LCL2, LCL3)')}</li>
            ) : (
              <li>
                {t('the calculated values: analysis results and anomaly scores. The control limits (UCL3, UCL2, LCL2, LCL3) are kept - they depend only on the stored values, so calculating them again gives the same numbers - and only filled in where one is missing')}{!single && deleteOnly > 0 ? t(' (for a Sensor whose calculation is off they are deleted too)') : ''}
              </li>
            )}
            <li>{t('every Issue that no person has reviewed (with its category suggestion and Ollama summary)')}</li>
            {!singleDeleteOnly && (
              <li>
                {t('the aggregated values of the Sensor’s aggregation levels (a switched-off level keeps its values) - they are aggregated again from the stored values in the background')}{!single && deleteOnly > 0 ? t(' (not for a Sensor whose calculation is off: its levels are left as they are)') : ''}
              </li>
            )}
          </ul>
        </div>
        <div>
          <Text weight="semibold">{t('Kept')}</Text>
          <ul className={styles.list}>
            <li>{t('all stored values (training data is unchanged, no retraining is started)')}</li>
            <li>{t('Issues a person has reviewed (Reviewed fault / Reviewed false positive) - they are not deleted and not duplicated')}</li>
            <li>{t('setpoints, policies and every setting')}{singleDeleteOnly ? t('; the aggregation levels and their Issues (they have their own switches)') : ''}</li>
          </ul>
        </div>
        {!singleDeleteOnly && (
          <Text>
            {t('Then the stored values are evaluated')}{' '}<b>{t('in time order, in batches')}</b>{t(', the way the live calculation catches up after a pause: every value gets a full evaluation and the Issues are raised again from the start - the result is the same as if each value had just arrived from the Device. New Issues get their Ollama summary as for live data. Values that arrive while it runs are evaluated too: it goes on up to the newest stored value, and then the live calculation takes over. It can take a long time for many values; the progress is shown on this page, and you can stop it.')}</Text>
        )}
        {!single && deleteOnly > 0 && (
          <MessageBar intent="warning">
            <MessageBarBody>
              {deleteOnly} {t('Sensor(s) have the raw calculation switched off: only their raw results are deleted, nothing is calculated for them (')}{recalculated} {t('Sensor(s) are recalculated). Switching their raw calculation on later calculates everything.')}</MessageBarBody>
          </MessageBar>
        )}
        {!single && left > 0 && (
          <MessageBar intent="info">
            <MessageBarBody>
              {left} {t('Sensor(s) are left out because they are in maintenance mode. Sensors that are not continuous and unidirectional are left out too; the result lists them.')}</MessageBarBody>
          </MessageBar>
        )}
        {!single && (
          <Field
            label={t('Only these Sensors (optional)')}
            hint={t('Paste Sensor names, one per line, or a sheet with a SensorName column (for example a Sensor import or export sheet). Empty = every Sensor of the Device.')}
            validationState={listProblem ? 'error' : 'none'}
            validationMessage={
              listProblem
                ? list.unknown.length > 0
                  ? t('Not a Sensor of this Device: {0}', list.unknown.slice(0, 5).join(', ') + (list.unknown.length > 5 ? ` (+${list.unknown.length - 5})` : ''))
                  : t('The list names no Sensor.')
                : listed
                  ? t('{0} Sensor(s) listed{1}', list.ids.length, list.duplicates.length > 0 ? t(' ({0} repeated name(s) counted once)', list.duplicates.length) : '')
                  : undefined
            }
          >
            <Textarea rows={3} resize="vertical" value={listText} onChange={(_, d) => setListText(d.value)} />
          </Field>
        )}
        {!single && (
          <Checkbox
            checked={acknowledged}
            onChange={(_, d) => setAcknowledged(d.checked === true)}
            label={t('I understand that the calculated values and the unreviewed Issues of these Sensors are deleted and recalculated.')}
          />
        )}
        {start.isError && <ErrorState error={start.error} />}
      </div>
    </ConfirmDialog>
  );
}
