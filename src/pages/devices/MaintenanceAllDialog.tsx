import { useState } from 'react';
import { Checkbox, MessageBar, MessageBarBody, Radio, RadioGroup, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useSetDeviceMaintenance } from '@/api/hooks/maintenance';
import type { SensorDto } from '@/api/hooks/sensors';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

type Choice = 'start' | 'end';

/**
 * "Maintenance (all Sensors)": switches maintenance mode on or off for EVERY Sensor of the Device in one request
 * (`PUT /api/Devices/{deviceId}/Maintenance` - a Device may have hundreds of Sensors, and the per-Sensor call is rate limited to 30 per
 * minute). Starting says plainly that data sent meanwhile is lost and needs an explicit acknowledgement; ending needs none. A choice
 * that would change nothing (everything already in maintenance, or nothing in maintenance) is disabled. Sensors that already have the
 * requested state are left untouched by the API. Company Admin only - the button that opens this dialog is shown to an Admin only, and
 * the server answers any non-Admin with 403 anyway.
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
  const choice = chosen ?? defaultChoice;
  const starting = choice === 'start';
  const changing = starting ? total - inMaintenance : inMaintenance;

  const close = () => {
    if (setMaintenance.isPending) return;
    setChosen(null);
    setAcknowledged(false);
    setMaintenance.reset();
    onClose();
  };

  const confirm = async () => {
    if (!choice) return;
    await setMaintenance.mutateAsync(starting);
    toast.success(starting ? `Maintenance started on ${changing} Sensor(s).` : `Maintenance ended on ${changing} Sensor(s).`);
    setChosen(null);
    setAcknowledged(false);
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title="Maintenance mode: all Sensors"
      intent={starting ? 'destructive' : 'normal'}
      confirmLabel={choice === null ? 'Apply' : starting ? `Start maintenance on ${changing} Sensor(s)` : `End maintenance on ${changing} Sensor(s)`}
      confirmDisabled={choice === null || (starting && !acknowledged)}
      busy={setMaintenance.isPending}
      onConfirm={() => void confirm().catch(() => undefined)}
      onCancel={close}
    >
      <div className={styles.body}>
        <Text>
          {inMaintenance} of {total} Sensor(s) of this Device are in maintenance mode now.
        </Text>
        <RadioGroup
          aria-label="Maintenance action for all Sensors"
          value={choice ?? ''}
          onChange={(_, d) => {
            setChosen(d.value as Choice);
            setAcknowledged(false);
          }}
        >
          <Radio value="start" disabled={!canStart} label={`Start maintenance on all Sensors (${total - inMaintenance} not in maintenance yet)`} />
          <Radio value="end" disabled={!canEnd} label={`End maintenance on all Sensors (${inMaintenance} in maintenance now)`} />
        </RadioGroup>
        {starting && (
          <>
            <MessageBar intent="warning">
              <MessageBarBody>
                While a Sensor is in maintenance, every value the Device sends for it is accepted but ignored: it is not stored and not analysed, so
                no Issue can be raised from it. Data sent during maintenance cannot be recovered afterwards.
              </MessageBarBody>
            </MessageBar>
            <Checkbox
              checked={acknowledged}
              onChange={(_, d) => setAcknowledged(d.checked === true)}
              label="I understand that telemetry of all these Sensors is lost while they are in maintenance."
            />
          </>
        )}
        {choice === 'end' && <Text>The Device’s values for these Sensors will be stored and analysed again from now on.</Text>}
        {setMaintenance.isError && <ErrorState error={setMaintenance.error} />}
      </div>
    </ConfirmDialog>
  );
}
