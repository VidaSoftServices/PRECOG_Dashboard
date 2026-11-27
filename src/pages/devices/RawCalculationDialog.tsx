import { Text } from '@fluentui/react-components';
import { useUpdateSensor, type SensorDto } from '@/api/hooks/sensors';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useT } from '@/lib/language';

/**
 * Switches the RAW calculation of one Sensor on or off (`Sensor.processingEnabled`) - on the Sensor's Policies page, next to the raw level, since 2026-11-27.
 * Off: the data is stored, the raw values are not analysed (no raw anomaly or Issue) and the Sensor leaves the model; the aggregation levels keep their own
 * switches. On: everything of the raw values not calculated yet is calculated in the background (the API's catch-up). The change schedules retraining.
 */
export function RawCalculationDialog({ deviceId, sensor, open, onClose }: { deviceId: number; sensor: SensorDto; open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useAppToast();
  const updateSensor = useUpdateSensor(deviceId, sensor.id!);
  const turningOff = sensor.processingEnabled !== false;
  const label = sensor.name || sensor.externalSensorId;

  return (
    <ConfirmDialog
      open={open}
      title={turningOff ? t('Stop the raw calculation of {0}?', label) : t('Resume the raw calculation of {0}?', label)}
      confirmLabel={turningOff ? t('Stop calculation') : t('Resume calculation')}
      intent={turningOff ? 'destructive' : 'normal'}
      busy={updateSensor.isPending}
      onConfirm={async () => {
        await updateSensor.mutateAsync({ processingEnabled: !turningOff }); // also refreshes the recalculation progress (the catch-up)
        toast.success(turningOff ? t('Raw calculation stopped: {0}', label) : t('Raw calculation resumed: {0}', label));
        onClose();
      }}
      onCancel={onClose}
    >
      <Text>
        {turningOff
          ? t("The values keep being stored, but the raw (native) values are no longer analysed: no new raw anomalies or Issues, and the Sensor leaves the model (the Device's model is retrained without it). The aggregation levels are not affected - each is calculated by its own switch. Everything already calculated and every open Issue is kept; Recalc deletes the raw results (and calculates nothing while this is off).")
          : t('Everything of the raw values that was not calculated - what arrived while it was off, and whatever a Recalc deleted - is calculated now in the background, in time order and in batches: anomalies and Issues. Issues a person has reviewed are kept and not duplicated. The Sensor returns to the model. The progress is shown on the Device page. (A bidirectional Sensor or one in maintenance mode is calculated from now on only.)')}
      </Text>
      {updateSensor.isError && <ErrorState error={updateSensor.error} />}
    </ConfirmDialog>
  );
}
