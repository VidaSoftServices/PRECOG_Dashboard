import { useState } from 'react';
import { Checkbox, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { ApiError } from '@/api/client';
import { useDeleteSetpoint, type SetpointDto } from '@/api/hooks/setpoints';
import { formatDateTimeWithZone } from '@/lib/dateTime';
import { describeValues } from '@/lib/setpointSheet';

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, maxHeight: '300px', overflowY: 'auto', margin: `${tokens.spacingVerticalS} 0` },
});

/**
 * "Delete setpoints...": pick which intervals of this Sensor to remove for good. Only the picked intervals go - their neighbours keep
 * their own validFrom/validTo, so a gap can remain, and a measurement with no effective setpoint is simply not analysed. Issues that
 * were found already stay; no retraining is scheduled (a setpoint is analysis configuration, not training data).
 */
export function DeleteSetpointsDialog({
  deviceId,
  sensorId,
  setpoints,
  open,
  onClose,
}: {
  deviceId: number;
  sensorId: number;
  setpoints: readonly SetpointDto[];
  open: boolean;
  onClose: () => void;
}) {
  const styles = useStyles();
  const toast = useAppToast();
  const deleteSetpoint = useDeleteSetpoint(deviceId, sensorId);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);

  const rows = setpoints.filter((s): s is SetpointDto & { id: number } => s.id != null);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const close = () => {
    if (busy) return;
    setSelected(new Set());
    setFailures([]);
    setError(null);
    onClose();
  };

  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const confirm = async () => {
    setBusy(true);
    setFailures([]);
    setError(null);
    let deleted = 0;
    const failed: string[] = [];
    let stoppedBy: unknown = null;
    try {
      for (const row of rows.filter((r) => selected.has(r.id))) {
        try {
          await deleteSetpoint.mutateAsync(row.id);
          deleted += 1;
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
            stoppedBy = e;
            setError(e);
            break;
          }
          failed.push(`${formatDateTimeWithZone(row.validFrom)}: ${e instanceof Error ? e.message : 'Request failed.'}`);
        }
      }
    } finally {
      setBusy(false);
    }
    if (deleted > 0) toast.success(`${deleted} setpoint(s) deleted.`);
    if (failed.length > 0) setFailures(failed);
    else if (stoppedBy === null) {
      setSelected(new Set());
      onClose();
    } else {
      setSelected(new Set());
    }
  };

  return (
    <ConfirmDialog
      open={open}
      title="Delete setpoints"
      intent="destructive"
      confirmLabel={selected.size > 0 ? `Delete ${selected.size} setpoint(s)` : 'Delete'}
      confirmDisabled={selected.size === 0}
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={close}
    >
      <MessageBar intent="warning">
        <MessageBarBody>
          The picked intervals are removed permanently. The others keep their own validity, so a gap can remain; a measurement with no
          effective setpoint is not analysed. Issues already found are not changed.
        </MessageBarBody>
      </MessageBar>
      <Checkbox
        label={`Select all (${rows.length})`}
        checked={allSelected}
        onChange={(_, d) => setSelected(d.checked ? new Set(rows.map((r) => r.id)) : new Set())}
        style={{ marginTop: tokens.spacingVerticalS }}
      />
      <div className={styles.list} role="group" aria-label="Setpoints to delete">
        {rows.map((row) => (
          <Checkbox
            key={row.id}
            checked={selected.has(row.id)}
            onChange={(_, d) => toggle(row.id, !!d.checked)}
            label={`${formatDateTimeWithZone(row.validFrom)} → ${row.validTo ? formatDateTimeWithZone(row.validTo) : 'open-ended'}: ${describeValues(row) || '—'}`}
          />
        ))}
      </div>
      {failures.length > 0 && (
        <MessageBar intent="error">
          <MessageBarBody>
            <Text block>{failures.length} deletion(s) failed:</Text>
            {failures.map((f) => (
              <Text key={f} block size={200}>
                {f}
              </Text>
            ))}
          </MessageBarBody>
        </MessageBar>
      )}
      {error !== null && <ErrorState error={error} />}
    </ConfirmDialog>
  );
}
