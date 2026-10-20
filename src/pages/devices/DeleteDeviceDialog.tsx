import { useState } from 'react';
import { Field, Input, MessageBar, MessageBarBody, Text, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { useDeleteDevice, type DeviceDeletionResult } from '@/api/hooks/devices';

/** What the server removes with a Device - shown before the user is asked to confirm. */
const REMOVED = [
  'all its Sensors with their setpoints and aggregation policies',
  'every telemetry value (signals, curves) and all aggregated values',
  'its Issues, reviews and category suggestions',
  'trained models and training requests',
  'knowledge shares in which it is the source or the target',
  'its DevicePrincipal (machine identity) with all credentials',
  'Reader access grants, group memberships and documents',
];

/**
 * The name the server expects as confirmation: the Device's name, or its ExternalDeviceId when the name is empty. Must
 * stay in step with the API's `DeviceDeletionService.ConfirmationName`.
 */
export function deleteConfirmationName(device: { deviceName?: string | null; externalDeviceId?: string | null }): string {
  return device.deviceName && device.deviceName.trim() !== '' ? device.deviceName : (device.externalDeviceId ?? '');
}

/**
 * Permanent deletion of a Device (Admin only - the caller only renders this for an Admin). Deliberately two steps:
 *   1. a warning that lists what is destroyed and that it cannot be undone;
 *   2. the user has to TYPE the Device's name exactly - the delete button stays disabled until it matches, and the
 *      server checks the same name again, so no other client can delete by id alone.
 * The API writes an audit event and a log line for the deletion.
 */
export function DeleteDeviceDialog({
  deviceId,
  device,
  open,
  onClose,
  onDeleted,
}: {
  deviceId: number;
  device: { deviceName?: string | null; externalDeviceId?: string | null };
  open: boolean;
  onClose: () => void;
  onDeleted: (result: DeviceDeletionResult) => void;
}) {
  const remove = useDeleteDevice(deviceId);
  const [step, setStep] = useState<'warning' | 'confirm'>('warning');
  const [typed, setTyped] = useState('');
  const expected = deleteConfirmationName(device);

  const close = () => {
    if (remove.isPending) return;
    setStep('warning');
    setTyped('');
    remove.reset();
    onClose();
  };

  if (step === 'warning') {
    return (
      <ConfirmDialog
        open={open}
        title="Delete this device permanently?"
        intent="destructive"
        confirmLabel="Continue…"
        onConfirm={() => setStep('confirm')}
        onCancel={close}
      >
        <MessageBar intent="error">
          <MessageBarBody>This cannot be undone. The deleted data cannot be recovered.</MessageBarBody>
        </MessageBar>
        <Text block style={{ marginTop: tokens.spacingVerticalM }}>
          Deleting <b>{expected}</b> permanently removes:
        </Text>
        <ul style={{ margin: `${tokens.spacingVerticalXS} 0`, paddingLeft: tokens.spacingHorizontalXL }}>
          {REMOVED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <ul style={{ margin: `${tokens.spacingVerticalXS} 0`, paddingLeft: tokens.spacingHorizontalXL }}>
          <li>Take a database backup first - nothing can restore a deleted device afterwards.</li>
          <li>A device with a lot of telemetry can take several minutes to delete. Keep this page open until it finishes.</li>
          <li>
            Other devices that were receiving this device&apos;s shared knowledge are scheduled for retraining.
          </li>
          <li>
            The device&apos;s id may be given to a device created later. Its credentials are deleted, so the old firmware can no longer
            sign in - reconfigure any physical device that still uses it.
          </li>
          <li>The deletion is logged (who, which device, how much was removed).</li>
        </ul>
        <Text block size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          Only want it out of the way? Disable the device instead - that keeps all of its data.
        </Text>
      </ConfirmDialog>
    );
  }

  const matches = typed === expected;
  return (
    <ConfirmDialog
      open={open}
      title="Type the device name to confirm"
      intent="destructive"
      confirmLabel="Delete permanently"
      busy={remove.isPending}
      confirmDisabled={!matches}
      onConfirm={() => remove.mutate(typed, { onSuccess: (result) => onDeleted(result) })}
      onCancel={close}
    >
      <Text block>
        To delete this device for good, type its name exactly as shown: <b>{expected}</b>
      </Text>
      <Field
        label="Device name"
        style={{ marginTop: tokens.spacingVerticalM }}
        validationState={typed !== '' && !matches ? 'error' : 'none'}
        validationMessage={typed !== '' && !matches ? 'Does not match the device name (case sensitive).' : undefined}
      >
        <Input value={typed} onChange={(_, d) => setTyped(d.value)} autoComplete="off" disabled={remove.isPending} />
      </Field>
      {remove.isError && <ErrorState error={remove.error} />}
    </ConfirmDialog>
  );
}
