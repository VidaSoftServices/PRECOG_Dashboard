import { useState } from 'react';
import { Checkbox, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useStartRecalculation } from '@/api/hooks/recalculation';
import { isRecalculable } from '@/lib/recalculation';
import type { SensorDto } from '@/api/hooks/sensors';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  list: { margin: 0, paddingLeft: tokens.spacingHorizontalXL },
});

/**
 * "Recalc": deletes every calculated value of a Sensor (or of every Sensor of the Device) and every Issue that no person has reviewed,
 * then lets the API evaluate the stored readings one by one from the first one - each as if it had just arrived - so the result equals
 * what the live analysis would have produced. Confirmation is mandatory (it deletes calculated results and can run for a long time), and
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
  const styles = useStyles();
  const toast = useAppToast();
  const start = useStartRecalculation(deviceId);
  const [acknowledged, setAcknowledged] = useState(false);

  const single = sensor !== undefined;
  const label = sensor ? sensor.name || sensor.externalSensorId : '';
  const eligible = sensors.filter(isRecalculable);
  const left = sensors.length - eligible.length;

  const close = () => {
    if (start.isPending) return;
    setAcknowledged(false);
    start.reset();
    onClose();
  };

  const confirm = async () => {
    const started = await start.mutateAsync(sensor?.id ?? undefined);
    const skipped = started.skipped?.length ?? 0;
    toast.success(
      single
        ? `Recalculation started: ${label}`
        : `Recalculation started on ${started.sensorIds?.length ?? 0} Sensor(s)${skipped > 0 ? `; ${skipped} left out` : ''}.`,
    );
    setAcknowledged(false);
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title={single ? `Recalculate ${label} from the start?` : 'Recalculate all Sensors from the start?'}
      intent="destructive"
      confirmLabel={single ? 'Recalculate' : `Recalculate ${eligible.length} Sensor(s)`}
      confirmDisabled={!single && (!acknowledged || eligible.length === 0)}
      busy={start.isPending}
      onConfirm={() => void confirm().catch(() => undefined)}
      onCancel={close}
    >
      <div className={styles.body}>
        <Text>
          {single
            ? 'Everything calculated for this Sensor is deleted and calculated again, starting from its first stored value.'
            : `Everything calculated for ${eligible.length} Sensor(s) of this Device is deleted and calculated again, starting from each Sensor’s first stored value.`}
        </Text>
        <div>
          <Text weight="semibold">Deleted first</Text>
          <ul className={styles.list}>
            <li>the calculated values: analysis results, anomaly scores and the control limits (UCL3, UCL2, LCL2, LCL3)</li>
            <li>every Issue that no person has reviewed (with its category suggestion and Ollama summary)</li>
            <li>the aggregated values of the Sensor’s aggregation levels (a switched-off level keeps its values) - they are aggregated again from the stored values in the background</li>
          </ul>
        </div>
        <div>
          <Text weight="semibold">Kept</Text>
          <ul className={styles.list}>
            <li>all stored values (training data is unchanged, no retraining is started)</li>
            <li>Issues a person has reviewed (Reviewed fault / Reviewed false positive) - they are not deleted and not duplicated</li>
            <li>setpoints, policies and every setting</li>
          </ul>
        </div>
        <Text>
          Then the stored values are evaluated <b>one by one, in time order</b>, each as if it had just arrived from the Device: every value gets a full
          evaluation and new Issues are raised from the start (only faster, as nothing has to wait for the next value). New Issues get their Ollama summary
          as for live data. Values that arrive while it runs are evaluated too: it goes on up to the newest stored value, and then the live calculation takes
          over. It can take a long time for many values; the progress is shown on this page, and you can stop it.
        </Text>
        {!single && left > 0 && (
          <MessageBar intent="info">
            <MessageBarBody>
              {left} Sensor(s) are left out because calculation is switched off for them or they are in maintenance mode. Sensors that are not continuous
              and unidirectional are left out too; the result lists them.
            </MessageBarBody>
          </MessageBar>
        )}
        {!single && (
          <Checkbox
            checked={acknowledged}
            onChange={(_, d) => setAcknowledged(d.checked === true)}
            label="I understand that the calculated values and the unreviewed Issues of these Sensors are deleted and recalculated."
          />
        )}
        {start.isError && <ErrorState error={start.error} />}
      </div>
    </ConfirmDialog>
  );
}
