import { MessageBar, MessageBarBody, Text, tokens } from '@fluentui/react-components';
import { TypeNameConfirmDialog } from '@/components/TypeNameConfirmDialog';
import { useDeleteDevice, useDeleteDeviceData, type DeviceDeletionResult, type DeviceDataDeletionResult } from '@/api/hooks/devices';

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

/** What "delete all data" removes, and - just as important - what it leaves. */
const DATA_REMOVED = [
  'every measured value of every Sensor of this device (signals and curves)',
  'the aggregated values and queued aggregation work derived from them',
  'all Issues with their reviews, category suggestions and Ollama jobs',
  'all trained models and training requests',
];
const DATA_KEPT = [
  'the device itself and all of its Sensors with their settings (setpoints, aggregation policies, maintenance and calculation switches)',
  'the DevicePrincipal with its credentials, Reader access, group memberships and documents',
  'knowledge shares (only the Issues listed in them are removed)',
];

type NamedDevice = { deviceName?: string | null; externalDeviceId?: string | null };

/**
 * The name the server expects as confirmation: the Device's name, or its ExternalDeviceId when the name is empty. Must
 * stay in step with the API's `DeviceDeletionService.ConfirmationName`.
 */
export function deleteConfirmationName(device: NamedDevice): string {
  return device.deviceName && device.deviceName.trim() !== '' ? device.deviceName : (device.externalDeviceId ?? '');
}

const list = { margin: `${tokens.spacingVerticalXS} 0`, paddingLeft: tokens.spacingHorizontalXL } as const;

/**
 * Permanent deletion of a Device (Admin only - the caller only renders this for an Admin). Deliberately two steps: a
 * warning that lists what is destroyed, then the user has to TYPE the Device's name exactly. The API checks the same
 * name again, audits and logs the deletion.
 */
export function DeleteDeviceDialog({
  deviceId,
  device,
  open,
  onClose,
  onDeleted,
}: {
  deviceId: number;
  device: NamedDevice;
  open: boolean;
  onClose: () => void;
  onDeleted: (result: DeviceDeletionResult) => void;
}) {
  const remove = useDeleteDevice(deviceId);
  const expected = deleteConfirmationName(device);

  return (
    <TypeNameConfirmDialog
      open={open}
      expectedName={expected}
      warningTitle="Delete this device permanently?"
      warning={
        <>
          <MessageBar intent="error">
            <MessageBarBody>This cannot be undone. The deleted data cannot be recovered.</MessageBarBody>
          </MessageBar>
          <Text block style={{ marginTop: tokens.spacingVerticalM }}>
            Deleting <b>{expected}</b> permanently removes:
          </Text>
          <ul style={list}>
            {REMOVED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <ul style={list}>
            <li>Take a database backup first - nothing can restore a deleted device afterwards.</li>
            <li>A device with a lot of telemetry can take several minutes to delete. Keep this page open until it finishes.</li>
            <li>Other devices that were receiving this device&apos;s shared knowledge are scheduled for retraining.</li>
            <li>
              The device&apos;s id may be given to a device created later. Its credentials are deleted, so the old firmware can no longer
              sign in - reconfigure any physical device that still uses it.
            </li>
            <li>The deletion is logged (who, which device, how much was removed).</li>
          </ul>
          <Text block size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Only want it out of the way? Disable the device instead - that keeps all of its data. Only want to clear the measured values? Use
            &quot;Delete all data&quot; instead - that keeps the device and its settings.
          </Text>
        </>
      }
      confirmPrompt="To delete this device for good, type its name exactly as shown:"
      confirmLabel="Delete permanently"
      busy={remove.isPending}
      error={remove.isError ? remove.error : null}
      onConfirm={(typed) => remove.mutate(typed, { onSuccess: (result) => onDeleted(result) })}
      onClose={() => {
        remove.reset();
        onClose();
      }}
    />
  );
}

/**
 * "Delete all data of this device" (Admin only): removes every measured value of every Sensor and what was derived from
 * them, and keeps the device, its Sensors and settings, Issues and models. Same two steps and typed name as the
 * deletion of the device itself.
 */
export function DeleteDeviceDataDialog({
  deviceId,
  device,
  open,
  onClose,
  onDeleted,
}: {
  deviceId: number;
  device: NamedDevice;
  open: boolean;
  onClose: () => void;
  onDeleted: (result: DeviceDataDeletionResult) => void;
}) {
  const remove = useDeleteDeviceData(deviceId);
  const expected = deleteConfirmationName(device);

  return (
    <TypeNameConfirmDialog
      open={open}
      expectedName={expected}
      warningTitle="Delete all data of this device?"
      warning={
        <>
          <MessageBar intent="error">
            <MessageBarBody>This cannot be undone. The deleted measurements cannot be recovered.</MessageBarBody>
          </MessageBar>
          <Text block style={{ marginTop: tokens.spacingVerticalM }}>
            This permanently removes, for <b>{expected}</b>:
          </Text>
          <ul style={list}>
            {DATA_REMOVED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Text block>It keeps:</Text>
          <ul style={list}>
            {DATA_KEPT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <ul style={list}>
            <li>Take a database backup first - nothing can restore deleted measurements afterwards.</li>
            <li>A device with a lot of telemetry can take several minutes. Keep this page open until it finishes.</li>
            <li>The device keeps receiving new data as usual; only what was stored so far is deleted. With no model, new data is not analysed against one until it is trained again.</li>
            <li>Other devices that were receiving this device&apos;s shared knowledge are scheduled for retraining.</li>
            <li>The action is logged (who, which device, how many rows).</li>
          </ul>
          <Text block size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Meant for clearing a device after testing. To remove the device itself and everything of it, delete the device instead.
          </Text>
        </>
      }
      confirmPrompt="To delete all data of this device, type its name exactly as shown:"
      confirmLabel="Delete all data"
      busy={remove.isPending}
      error={remove.isError ? remove.error : null}
      onConfirm={(typed) => remove.mutate(typed, { onSuccess: (result) => onDeleted(result) })}
      onClose={() => {
        remove.reset();
        onClose();
      }}
    />
  );
}
