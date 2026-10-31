import { Text } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useUpdateSensor, type SensorDto } from '@/api/hooks/sensors';

/**
 * Shows or hides one Sensor in Live Monitoring and Smart Analytics (`Sensor.visible`). A presentation flag only: nothing is
 * deleted, recalculated or retrained, the data is still stored, calculated and trained on, the Sensor stays on the Device page (to show
 * it again), and an Issue that involves it still shows it. Confirmed because the Sensor disappears from those two pages for everybody.
 * Company Admin only on the server (the switch that opens this dialog is shown to an Admin only).
 */
export function VisibilityDialog({
  deviceId,
  sensor,
  open,
  onClose,
}: {
  deviceId: number;
  sensor: SensorDto;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useAppToast();
  const updateSensor = useUpdateSensor(deviceId, sensor.id!);
  const hiding = sensor.visible !== false;
  const label = sensor.name || sensor.externalSensorId;

  const confirm = async () => {
    await updateSensor.mutateAsync({ visible: !hiding });
    toast.success(hiding ? `Hidden from Live Monitoring and Smart Analytics: ${label}` : `Shown in Live Monitoring and Smart Analytics: ${label}`);
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title={hiding ? `Hide ${label}?` : `Show ${label} again?`}
      confirmLabel={hiding ? 'Hide Sensor' : 'Show Sensor'}
      busy={updateSensor.isPending}
      onConfirm={() => void confirm().catch(() => undefined)}
      onCancel={onClose}
    >
      <Text>
        {hiding
          ? 'This Sensor will no longer appear in Live Monitoring or in the Sensor pickers of Smart Analytics - for everybody. Nothing else changes: its data is still stored, calculated and used to train the model, it stays on this page, and an Issue that involves it still shows it.'
          : 'This Sensor will appear in Live Monitoring and in the Sensor pickers of Smart Analytics again.'}
      </Text>
      {updateSensor.isError && <ErrorState error={updateSensor.error} />}
    </ConfirmDialog>
  );
}
