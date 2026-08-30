import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Text,
  Body1Strong,
  Input,
  Field,
  Switch,
  Divider,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ShieldKeyhole24Regular, Settings24Regular, ChartMultiple24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { EnabledPill, FreshnessPill } from '@/components/StatusPill';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useDevice, useUpdateDevice, useDisableDevice } from '@/api/hooks/devices';
import { useSensors } from '@/api/hooks/sensors';
import { useDevicePrincipal } from '@/api/hooks/devicePrincipal';
import { useTrainingRequests } from '@/api/hooks/training';
import { freshnessOf, formatDateTimeWithZone, formatRelative } from '@/lib/dateTime';
import { useAuth } from '@/auth/AuthContext';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  card: {
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  sensorRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalS} 0`,
  },
  editForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    maxWidth: '420px',
  },
});

export function DeviceDetailPage() {
  const styles = useStyles();
  const { deviceId } = useParams<{ deviceId: string }>();
  const id = Number(deviceId);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useAppToast();

  const deviceQuery = useDevice(id);
  const sensorsQuery = useSensors(id);
  const principalQuery = useDevicePrincipal(id);
  const trainingQuery = useTrainingRequests(id);

  const [editing, setEditing] = useState(false);
  const updateDevice = useUpdateDevice(id);
  const disableDevice = useDisableDevice(id);
  const [nameDraft, setNameDraft] = useState('');
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);

  if (deviceQuery.isLoading) return <LoadingState label="Loading device…" />;
  if (deviceQuery.isError) return <ErrorState error={deviceQuery.error} onRetry={() => deviceQuery.refetch()} />;
  const device = deviceQuery.data;
  if (!device) return <EmptyState title="Device not found" />;

  const startEdit = () => {
    setNameDraft(device.deviceName ?? '');
    setEditing(true);
  };

  const saveEdit = async () => {
    await updateDevice.mutateAsync({ deviceName: nameDraft });
    toast.success('Device updated');
    setEditing(false);
  };

  return (
    <>
      <PageHeader
        title={device.deviceName || device.externalDeviceId || `Device ${device.id}`}
        description={`${device.applicationMode} · ${device.externalDeviceId}`}
        actions={
          isAdmin && (
            <>
              <Button icon={<Settings24Regular />} onClick={editing ? saveEdit : startEdit} disabled={updateDevice.isPending}>
                {editing ? (updateDevice.isPending ? 'Saving…' : 'Save') : 'Edit'}
              </Button>
              <Button
                icon={<ShieldKeyhole24Regular />}
                onClick={() => navigate(`/devices/${id}/principal`)}
              >
                DevicePrincipal
              </Button>
            </>
          )
        }
      />

      {editing && (
        <Card className={styles.card} style={{ marginBottom: tokens.spacingVerticalL, maxWidth: '420px' }}>
          <div className={styles.editForm}>
            <Field label="Name">
              <Input value={nameDraft} onChange={(_, d) => setNameDraft(d.value)} />
            </Field>
            <Field label="Enabled">
              <Switch
                checked={device.enabled ?? false}
                label={device.enabled ? 'Enabled' : 'Disabled'}
                onChange={(_, d) =>
                  updateDevice.mutate(
                    { enabled: d.checked },
                    { onSuccess: () => toast.success(d.checked ? 'Device enabled' : 'Device disabled') },
                  )
                }
              />
            </Field>
            {updateDevice.isError && <ErrorState error={updateDevice.error} />}
            <Button appearance="secondary" onClick={() => setEditing(false)}>
              Close
            </Button>
          </div>
        </Card>
      )}

      <div className={styles.grid}>
        <Card className={styles.card}>
          <Body1Strong>Status</Body1Strong>
          <EnabledPill enabled={device.enabled} />
          <Text size={200}>Last heartbeat: {formatRelative(device.heartBeat)}</Text>
          <FreshnessPill freshness={freshnessOf(device.heartBeat)} />
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {formatDateTimeWithZone(device.heartBeat)}
          </Text>
        </Card>

        <Card className={styles.card}>
          <Body1Strong>Machine access</Body1Strong>
          {principalQuery.isLoading && <LoadingState label="" />}
          {principalQuery.data === null && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Not provisioned yet.
            </Text>
          )}
          {principalQuery.data && (
            <>
              <EnabledPill enabled={principalQuery.data.enabled} />
              <Text size={200}>Last seen: {formatRelative(principalQuery.data.lastSeenAt)}</Text>
              <Text size={200}>{principalQuery.data.credentials?.length ?? 0} credential(s)</Text>
            </>
          )}
        </Card>

        <Card className={styles.card}>
          <Body1Strong>Training</Body1Strong>
          {trainingQuery.isLoading && <LoadingState label="" />}
          {trainingQuery.data && trainingQuery.data.length === 0 && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              No training requests yet.
            </Text>
          )}
          {trainingQuery.data && trainingQuery.data[0] && (
            <>
              <Text size={200}>Latest: {trainingQuery.data[0].status}</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {formatRelative(trainingQuery.data[0].requestedAt)}
              </Text>
            </>
          )}
          <Button size="small" appearance="secondary" onClick={() => navigate('/training?deviceId=' + id)}>
            View training
          </Button>
        </Card>
      </div>

      <Divider style={{ margin: `${tokens.spacingVerticalL} 0` }} />

      <PageHeader
        title="Sensors"
        level="h2"
        actions={
          <Button icon={<ChartMultiple24Regular />} onClick={() => navigate(`/analytics?deviceId=${id}`)}>
            Analyze
          </Button>
        }
      />

      {sensorsQuery.isLoading && <LoadingState label="Loading sensors…" />}
      {sensorsQuery.isError && <ErrorState error={sensorsQuery.error} onRetry={() => sensorsQuery.refetch()} />}
      {sensorsQuery.data && sensorsQuery.data.length === 0 && (
        <EmptyState title="No sensors configured" description="Add a Sensor to start collecting telemetry from this Device." />
      )}
      {sensorsQuery.data && sensorsQuery.data.length > 0 && (
        <Card>
          {sensorsQuery.data.map((sensor, index) => (
            <div key={sensor.id}>
              {index > 0 && <Divider />}
              <div className={styles.sensorRow}>
                <div>
                  <Body1Strong>{sensor.name || sensor.externalSensorId}</Body1Strong>
                  <br />
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {sensor.direction} {sensor.quantityKind ? `· ${sensor.quantityKind}` : ''}{' '}
                    {sensor.unitCode ? `(${sensor.unitCode})` : ''}
                  </Text>
                </div>
                <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center' }}>
                  <EnabledPill enabled={sensor.enabled} />
                  <Button size="small" onClick={() => navigate(`/devices/${id}/sensors/${sensor.id}/policies`)}>
                    Policies
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {isAdmin && (
        <div style={{ marginTop: tokens.spacingVerticalXL }}>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            There is no permanent delete for a Device - disabling is the supported way to retire one.
          </Text>
          <br />
          <Button
            appearance="secondary"
            disabled={!device.enabled || disableDevice.isPending}
            onClick={() => setDisableConfirmOpen(true)}
          >
            {disableDevice.isPending ? 'Disabling…' : 'Disable Device'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={disableConfirmOpen}
        title="Disable this Device?"
        intent="destructive"
        confirmLabel="Disable"
        busy={disableDevice.isPending}
        onConfirm={async () => {
          await disableDevice.disable();
          toast.success('Device disabled');
          setDisableConfirmOpen(false);
        }}
        onCancel={() => setDisableConfirmOpen(false)}
      >
        <Text>
          The Device stops accepting telemetry and its scheduled retraining eligibility pauses. There is no
          permanent delete - re-enable it later to resume normal operation.
        </Text>
      </ConfirmDialog>
    </>
  );
}
