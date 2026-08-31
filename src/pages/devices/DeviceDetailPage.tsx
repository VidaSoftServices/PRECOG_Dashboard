import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Text,
  Body1Strong,
  Input,
  Field,
  Select,
  Switch,
  Divider,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ShieldKeyhole24Regular, Settings24Regular, ChartMultiple24Regular, AddCircle24Regular, Edit24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { EnabledPill, FreshnessPill } from '@/components/StatusPill';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useDevice, useUpdateDevice, useDisableDevice } from '@/api/hooks/devices';
import { useSensors, useCreateSensor, useUpdateSensor, type SensorDto } from '@/api/hooks/sensors';
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
    flexWrap: 'wrap',
    gap: tokens.spacingVerticalS,
  },
  editForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    maxWidth: '420px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
});

type Direction = 'lowerisbetter' | 'higherisbetter' | 'bidirectional';

function DirectionSelect({ value, onChange }: { value: Direction; onChange: (value: Direction) => void }) {
  return (
    <Select value={value} onChange={(_, d) => onChange(d.value as Direction)}>
      <option value="lowerisbetter">Lower is better</option>
      <option value="higherisbetter">Higher is better</option>
      <option value="bidirectional">Bidirectional</option>
    </Select>
  );
}

/**
 * Creating a Sensor also creates its raw/base AggregationPolicy in the same
 * call (CreateSensorRequest requires rawScale/rawLookback) - every other
 * aggregation level is added later from the Sensor's own Policies page.
 * `isCurve` is derived from the parent Device's applicationMode, never
 * exposed as a free choice here: a Sensor whose curve/signal storage
 * disagreed with its own Device's mode would be a self-inconsistent state
 * nothing else in this app expects.
 */
function NewSensorDialog({
  deviceId,
  applicationMode,
  open,
  onClose,
}: {
  deviceId: number;
  applicationMode: string | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const styles = useStyles();
  const toast = useAppToast();
  const createSensor = useCreateSensor(deviceId);
  const [externalSensorId, setExternalSensorId] = useState('');
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<Direction>('lowerisbetter');
  const [quantityKind, setQuantityKind] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [rawLookback, setRawLookback] = useState('');
  const [rawScale, setRawScale] = useState('');

  const reset = () => {
    setExternalSensorId('');
    setName('');
    setDirection('lowerisbetter');
    setQuantityKind('');
    setUnitCode('');
    setRawLookback('');
    setRawScale('');
  };

  const canSubmit = externalSensorId.trim() !== '' && rawScale.trim() !== '' && Number(rawLookback) > 0;

  return (
    <ConfirmDialog
      open={open}
      title="Add Sensor"
      confirmLabel="Create"
      busy={createSensor.isPending}
      confirmDisabled={!canSubmit}
      onConfirm={async () => {
        await createSensor.mutateAsync({
          externalSensorId,
          name: name || undefined,
          direction,
          quantityKind: quantityKind || undefined,
          unitCode: unitCode || undefined,
          isCurve: applicationMode === 'periodic',
          rawScale,
          rawLookback: Number(rawLookback),
        });
        toast.success('Sensor created');
        reset();
        onClose();
      }}
      onCancel={() => {
        reset();
        onClose();
      }}
    >
      <div className={styles.form}>
        <Field label="External Sensor ID" required hint="A unique tag name for this Sensor within the Device - used by the uploader.">
          <Input value={externalSensorId} onChange={(_, d) => setExternalSensorId(d.value)} />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(_, d) => setName(d.value)} />
        </Field>
        <Field label="Direction" required>
          <DirectionSelect value={direction} onChange={setDirection} />
        </Field>
        <Field label="Quantity kind" hint="e.g. temperature, pressure, vibration">
          <Input value={quantityKind} onChange={(_, d) => setQuantityKind(d.value)} />
        </Field>
        <Field label="Unit code" hint="e.g. degC, bar, mm/s">
          <Input value={unitCode} onChange={(_, d) => setUnitCode(d.value)} />
        </Field>
        <Field label="Raw lookback" required hint="How far back the raw policy's analysis window extends. Must be greater than zero.">
          <Input type="number" min="1" value={rawLookback} onChange={(_, d) => setRawLookback(d.value)} />
        </Field>
        <Field label="Raw scale" required hint='A time unit (e.g. "Days", "Hours") or "periods" for a periodic Device - same free-text convention as the Sensor Policies page.'>
          <Input value={rawScale} onChange={(_, d) => setRawScale(d.value)} />
        </Field>
        {createSensor.isError && <ErrorState error={createSensor.error} />}
      </div>
    </ConfirmDialog>
  );
}

function EditSensorDialog({
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
  const styles = useStyles();
  const toast = useAppToast();
  const updateSensor = useUpdateSensor(deviceId, sensor.id!);
  const [name, setName] = useState(sensor.name ?? '');
  const [quantityKind, setQuantityKind] = useState(sensor.quantityKind ?? '');
  const [unitCode, setUnitCode] = useState(sensor.unitCode ?? '');
  const [direction, setDirection] = useState<Direction>((sensor.direction as Direction) ?? 'lowerisbetter');

  return (
    <ConfirmDialog
      open={open}
      title={`Edit ${sensor.name || sensor.externalSensorId}`}
      confirmLabel="Save"
      busy={updateSensor.isPending}
      onConfirm={async () => {
        await updateSensor.mutateAsync({
          name: name || null,
          quantityKind: quantityKind || null,
          unitCode: unitCode || null,
          direction,
        });
        toast.success('Sensor updated');
        onClose();
      }}
      onCancel={onClose}
    >
      <div className={styles.form}>
        <Field label="Name">
          <Input value={name} onChange={(_, d) => setName(d.value)} />
        </Field>
        <Field label="Direction">
          <DirectionSelect value={direction} onChange={setDirection} />
        </Field>
        <Field label="Quantity kind">
          <Input value={quantityKind} onChange={(_, d) => setQuantityKind(d.value)} />
        </Field>
        <Field label="Unit code">
          <Input value={unitCode} onChange={(_, d) => setUnitCode(d.value)} />
        </Field>
        {updateSensor.isError && <ErrorState error={updateSensor.error} />}
      </div>
    </ConfirmDialog>
  );
}

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
  const [addSensorOpen, setAddSensorOpen] = useState(false);
  const [editingSensorId, setEditingSensorId] = useState<number | null>(null);

  if (deviceQuery.isLoading) return <LoadingState label="Loading device…" />;
  if (deviceQuery.isError) return <ErrorState error={deviceQuery.error} onRetry={() => deviceQuery.refetch()} />;
  const device = deviceQuery.data;
  if (!device) return <EmptyState title="Device not found" />;

  const editingSensor = sensorsQuery.data?.find((s) => s.id === editingSensorId) ?? null;

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
          <>
            {isAdmin && (
              <Button icon={<AddCircle24Regular />} onClick={() => setAddSensorOpen(true)}>
                Add Sensor
              </Button>
            )}
            <Button icon={<ChartMultiple24Regular />} onClick={() => navigate(`/analytics?deviceId=${id}`)}>
              Analyze
            </Button>
          </>
        }
      />

      {sensorsQuery.isLoading && <LoadingState label="Loading sensors…" />}
      {sensorsQuery.isError && <ErrorState error={sensorsQuery.error} onRetry={() => sensorsQuery.refetch()} />}
      {sensorsQuery.data && sensorsQuery.data.length === 0 && (
        <EmptyState
          title="No sensors configured"
          description={isAdmin ? 'Add a Sensor to start collecting telemetry from this Device.' : 'This Device has no Sensors yet.'}
          action={
            isAdmin && (
              <Button icon={<AddCircle24Regular />} onClick={() => setAddSensorOpen(true)}>
                Add Sensor
              </Button>
            )
          }
        />
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
                  {isAdmin && (
                    <Button size="small" icon={<Edit24Regular />} onClick={() => setEditingSensorId(sensor.id!)}>
                      Edit
                    </Button>
                  )}
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

      {isAdmin && (
        <NewSensorDialog
          deviceId={id}
          applicationMode={device.applicationMode}
          open={addSensorOpen}
          onClose={() => setAddSensorOpen(false)}
        />
      )}

      {isAdmin && editingSensor && (
        <EditSensorDialog
          key={editingSensor.id}
          deviceId={id}
          sensor={editingSensor}
          open={editingSensorId !== null}
          onClose={() => setEditingSensorId(null)}
        />
      )}
    </>
  );
}
