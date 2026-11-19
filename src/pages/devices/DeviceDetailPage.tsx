import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelectedDevice } from '@/lib/selectedDevice';
import { DEFAULT_DEVICE_TIME_ZONE, timeZoneOptions } from '@/lib/aggregationOptions';
import {
  Button,
  Card,
  Text,
  Body1Strong,
  Input,
  Field,
  Select,
  Switch,
  Textarea,
  Divider,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Delete24Regular, ShieldKeyhole24Regular, Settings24Regular, ChartMultiple24Regular, AddCircle24Regular, Edit24Regular, Wrench24Regular, TableArrowUp24Regular, TargetEdit24Regular, DocumentText24Regular, ArrowSync24Regular, DataBarVertical24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { EnabledPill, FreshnessPill, HiddenPill, MaintenancePill, ProcessingOffPill } from '@/components/StatusPill';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SensorImportDialog } from './SensorImportDialog';
import { SensorTypeInput } from '@/components/SensorTypeInput';
import { ExportSensorMapButton } from './ExportSensorMapButton';
import { ManageSetpointsDialog } from './ManageSetpointsDialog';
import { DescriptionsDialog } from './DescriptionsDialog';
import { DeleteDeviceDataDialog, DeleteDeviceDialog } from './DeleteDeviceDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useDevice, useUpdateDevice, useDisableDevice } from '@/api/hooks/devices';
import { useSensors, useCreateSensor, useUpdateSensor, type SensorDto } from '@/api/hooks/sensors';
import { useSensorDescriptionTexts, useUpdateSensorDescriptions } from '@/api/hooks/sensorDescriptions';
import { MAX_DESCRIPTION_TEXT } from '@/lib/descriptionSheet';
import { useSetSensorMaintenance } from '@/api/hooks/maintenance';
import { MaintenanceAllDialog } from './MaintenanceAllDialog';
import { EndMaintenanceDialog } from './EndMaintenanceDialog';
import { MaintenanceHistoryCard } from './MaintenanceHistoryCard';
import { RecalculateDialog } from './RecalculateDialog';
import { BulkAggregationDialog } from './BulkAggregationDialog';
import { isDeleteOnly, isRecalculable } from '@/lib/recalculation';
import { CalculatedUpToNote, RecalculationProgress, SensorRecalculationNote } from './RecalculationProgress';
import { useCalculatedUpTo, useRecalculationStatus } from '@/api/hooks/recalculation';
import { VisibilityDialog } from './VisibilityDialog';
import { useDevicePrincipal } from '@/api/hooks/devicePrincipal';
import { useTrainingRequests } from '@/api/hooks/training';
import { freshnessOf, formatDateTime, formatDateTimeWithZone, formatRelative } from '@/lib/dateTime';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';
import { useAuth } from '@/auth/AuthContext';
import { useT } from '@/lib/language';

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
  const t = useT();
  return (
    <Select value={value} onChange={(_, d) => onChange(d.value as Direction)}>
      <option value="lowerisbetter">{t('Lower is better')}</option>
      <option value="higherisbetter">{t('Higher is better')}</option>
      <option value="bidirectional">{t('Bidirectional')}</option>
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
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const createSensor = useCreateSensor(deviceId);
  const [externalSensorId, setExternalSensorId] = useState('');
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<Direction>('lowerisbetter');
  const [sensorType, setSensorType] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [rawLookback, setRawLookback] = useState('');
  const [rawScale, setRawScale] = useState('');

  const reset = () => {
    setExternalSensorId('');
    setName('');
    setDirection('lowerisbetter');
    setSensorType('');
    setUnitCode('');
    setRawLookback('');
    setRawScale('');
  };

  const canSubmit = externalSensorId.trim() !== '' && rawScale.trim() !== '' && Number(rawLookback) > 0;

  return (
    <ConfirmDialog
      open={open}
      title={t('Add Sensor')}
      confirmLabel="Create"
      busy={createSensor.isPending}
      confirmDisabled={!canSubmit}
      onConfirm={async () => {
        await createSensor.mutateAsync({
          externalSensorId,
          name: name || undefined,
          direction,
          sensorType: sensorType || undefined,
          unitCode: unitCode || undefined,
          isCurve: applicationMode === 'periodic',
          rawScale,
          rawLookback: Number(rawLookback),
        });
        toast.success(t('Sensor created'));
        reset();
        onClose();
      }}
      onCancel={() => {
        reset();
        onClose();
      }}
    >
      <div className={styles.form}>
        <Field label={t('External Sensor ID')} required hint={t('A unique tag name for this Sensor within the Device - used by the uploader.')}>
          <Input value={externalSensorId} onChange={(_, d) => setExternalSensorId(d.value)} />
        </Field>
        <Field label={t('Name')}>
          <Input value={name} onChange={(_, d) => setName(d.value)} />
        </Field>
        <Field label={t('Direction')} required>
          <DirectionSelect value={direction} onChange={setDirection} />
        </Field>
        <Field label={t('Sensor type')} hint={t('Pick one already in use, or type a new one - e.g. temperature, pressure, vibration')}>
          <SensorTypeInput value={sensorType} onChange={setSensorType} />
        </Field>
        <Field label={t('Unit code')} hint={t('e.g. degC, bar, mm/s')}>
          <Input value={unitCode} onChange={(_, d) => setUnitCode(d.value)} />
        </Field>
        <Field label={t('Raw lookback')} required hint={t('How far back the raw policy\'s analysis window extends. Must be greater than zero.')}>
          <Input type="number" min="1" value={rawLookback} onChange={(_, d) => setRawLookback(d.value)} />
        </Field>
        <Field label={t('Raw scale')} required hint={t('A time unit (e.g. "Days", "Hours") or "periods" for a periodic Device - same free-text convention as the Sensor Policies page.')}>
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
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const updateSensor = useUpdateSensor(deviceId, sensor.id!);
  const updateDescriptions = useUpdateSensorDescriptions(deviceId, sensor.id!);
  const stored = useSensorDescriptionTexts(deviceId, sensor.id, open);
  const [name, setName] = useState(sensor.name ?? '');
  const [sensorType, setSensorType] = useState(sensor.sensorType ?? '');
  const [unitCode, setUnitCode] = useState(sensor.unitCode ?? '');
  const [direction, setDirection] = useState<Direction>((sensor.direction as Direction) ?? 'lowerisbetter');
  // The two stored descriptions (markdown). The fields stay locked until the stored texts are read, so an unread text is never overwritten with a blank.
  const storedEn = stored.data?.find((d) => d.language === 'en')?.description ?? '';
  const storedHu = stored.data?.find((d) => d.language === 'hu')?.description ?? '';
  const [descEn, setDescEn] = useState<string | null>(null);
  const [descHu, setDescHu] = useState<string | null>(null);
  const shownEn = descEn ?? storedEn;
  const shownHu = descHu ?? storedHu;
  const descriptionsChanged = shownEn.trim() !== storedEn.trim() || shownHu.trim() !== storedHu.trim();
  const descriptionTooLong = shownEn.length > MAX_DESCRIPTION_TEXT || shownHu.length > MAX_DESCRIPTION_TEXT;

  return (
    <ConfirmDialog
      open={open}
      title={t('Edit {0}', sensor.name || sensor.externalSensorId)}
      confirmLabel="Save"
      busy={updateSensor.isPending || updateDescriptions.isPending}
      confirmDisabled={descriptionTooLong}
      onConfirm={async () => {
        await updateSensor.mutateAsync({
          name: name || null,
          sensorType: sensorType || null,
          unitCode: unitCode || null,
          direction,
        });
        // Both languages are replaced by the API, so only send them when they were read and something was changed.
        if (stored.isSuccess && descriptionsChanged) await updateDescriptions.mutateAsync({ en: shownEn, hu: shownHu });
        toast.success(t('Sensor updated'));
        onClose();
      }}
      onCancel={onClose}
    >
      <div className={styles.form}>
        <Field label={t('Name')}>
          <Input value={name} onChange={(_, d) => setName(d.value)} />
        </Field>
        <Field label={t('Direction')}>
          <DirectionSelect value={direction} onChange={setDirection} />
        </Field>
        <Field label={t('Sensor type')}>
          <SensorTypeInput value={sensorType} onChange={setSensorType} />
        </Field>
        <Field label={t('Unit code')}>
          <Input value={unitCode} onChange={(_, d) => setUnitCode(d.value)} />
        </Field>
        <Field
          label={t('Description (English)')}
          hint={t('What this indicator shows - markdown (## heading, **bold**, - list). Shown beside its enlarged chart; leave empty for none.')}
          validationState={shownEn.length > MAX_DESCRIPTION_TEXT ? 'error' : 'none'}
          validationMessage={shownEn.length > MAX_DESCRIPTION_TEXT ? t('At most {0} characters.', MAX_DESCRIPTION_TEXT) : undefined}
        >
          <Textarea value={shownEn} rows={6} resize="vertical" disabled={!stored.isSuccess} onChange={(_, d) => setDescEn(d.value)} />
        </Field>
        <Field
          label={t('Description (Hungarian)')}
          validationState={shownHu.length > MAX_DESCRIPTION_TEXT ? 'error' : 'none'}
          validationMessage={shownHu.length > MAX_DESCRIPTION_TEXT ? t('At most {0} characters.', MAX_DESCRIPTION_TEXT) : undefined}
        >
          <Textarea value={shownHu} rows={6} resize="vertical" disabled={!stored.isSuccess} onChange={(_, d) => setDescHu(d.value)} />
        </Field>
        {stored.isError && <ErrorState error={stored.error} />}
        {updateSensor.isError && <ErrorState error={updateSensor.error} />}
        {updateDescriptions.isError && <ErrorState error={updateDescriptions.error} />}
      </div>
    </ConfirmDialog>
  );
}

/**
 * Switches one Sensor's maintenance mode. Starting maintenance is a
 * consequential action - every value the Device sends for that Sensor is
 * accepted but thrown away (not stored, not analysed) until it is ended, and
 * that data cannot be recovered afterwards - so it goes through the shared
 * confirm dialog and says so. Ending it is harmless and uses the same dialog
 * only for consistency.
 */
/** The per-Sensor Recalc button's tooltip: what it will do (recalculate, or only delete when calculation is off), or why it is disabled. */
function recalcButtonTitle(sensor: SensorDto): string {
  if (!isRecalculable(sensor)) return 'The Sensor is in maintenance mode.';
  if (isDeleteOnly(sensor)) return 'Calculation is switched off: deletes the calculated values and unreviewed Issues of this Sensor; nothing is calculated.';
  return 'Delete the calculated values and unreviewed Issues of this Sensor and calculate them again from its first value.';
}

/**
 * Switches one Sensor's calculation on or off (`Sensor.processingEnabled`).
 * Off: its data is still stored, but new values trigger no analysis, Issue detection or summary,
 * and the Sensor is no longer part of the model (the API leaves it out of the training and retrains the Device). On: everything not
 * calculated yet (the values stored while it was off, or left over by a Recalc
 * with calculation off) is calculated in the background, one value at a time,
 * exactly as the live calculation would have done (the API's catch-up; its
 * progress is the Device's recalculation progress). The change schedules retraining
 * (the Sensor enters or leaves the model). Confirmed because turning it off silences Issue detection for
 * that Sensor.
 */
function ProcessingDialog({
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
  const t = useT();
  const toast = useAppToast();
  const updateSensor = useUpdateSensor(deviceId, sensor.id!);
  const turningOff = sensor.processingEnabled !== false;
  const label = sensor.name || sensor.externalSensorId;

  return (
    <ConfirmDialog
      open={open}
      title={turningOff ? t('Stop calculating {0}?', label) : t('Resume calculating {0}?', label)}
      confirmLabel={turningOff ? t('Stop calculation') : t('Resume calculation')}
      intent={turningOff ? 'destructive' : 'normal'}
      busy={updateSensor.isPending}
      onConfirm={async () => {
        await updateSensor.mutateAsync({ processingEnabled: !turningOff }); // also refreshes the recalculation progress (the catch-up)
        toast.success(turningOff ? t('Calculation stopped: {0}', label) : t('Calculation resumed: {0}', label));
        onClose();
      }}
      onCancel={onClose}
    >
      <Text>
        {turningOff
          ? t('New values for this Sensor will still be stored, but they will no longer trigger any calculation - no analysis and no Issues will be raised from this Sensor - and the Sensor leaves the model: it is no longer trained on, and the Device\'s model is retrained without it. Everything already calculated (analysis results, control limits) and every Issue that is already open is kept as it is; Recalc deletes them (and calculates nothing while calculation is off). Switching calculation on again calculates everything that was not calculated.')
          : t('Everything not calculated yet - the values that arrived while calculation was off, and whatever a Recalc deleted - is calculated now in the background, one value at a time in time order, exactly as if calculation had been on all along: control limits, anomalies and Issues. Issues a person has reviewed are kept and not duplicated. The progress is shown on this page; new values are calculated as usual when it has caught up. (A bidirectional Sensor or one in maintenance mode is calculated from now on only.)')}
      </Text>
      {updateSensor.isError && <ErrorState error={updateSensor.error} />}
    </ConfirmDialog>
  );
}

function MaintenanceDialog({
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
  const t = useT();
  const toast = useAppToast();
  const setMaintenance = useSetSensorMaintenance(deviceId, sensor.id!);
  const starting = !sensor.maintenanceMode;
  const label = sensor.name || sensor.externalSensorId;

  // Ending asks what the maintenance was (a replacement starts a new baseline), in two steps.
  if (!starting)
    return (
      <EndMaintenanceDialog
        open={open}
        targetLabel={label ?? ''}
        sinceText={sensor.maintenanceSince ? t('In maintenance since {0}', formatDateTime(sensor.maintenanceSince)) : undefined}
        busy={setMaintenance.isPending}
        error={setMaintenance.isError ? setMaintenance.error : undefined}
        onSubmit={async (details) => {
          await setMaintenance.mutateAsync({ enabled: false, ...details });
          toast.success(t('Maintenance ended: {0}', label));
        }}
        onClose={onClose}
      />
    );

  return (
    <ConfirmDialog
      open={open}
      title={starting ? t('Start maintenance on {0}?', label) : t('End maintenance on {0}?', label)}
      confirmLabel={starting ? t('Start maintenance') : t('End maintenance')}
      intent={starting ? 'destructive' : 'normal'}
      busy={setMaintenance.isPending}
      onConfirm={async () => {
        await setMaintenance.mutateAsync({ enabled: true });
        toast.success(t('Maintenance started: {0}', label));
        onClose();
      }}
      onCancel={onClose}
    >
      <Text>
        {starting
          ? t('While this Sensor is in maintenance, every value the Device sends for it is accepted but ignored: it is not stored and not analysed, so no Issue can be raised from it. Data sent during maintenance cannot be recovered afterwards.')
          : t('The Device’s values for this Sensor will be stored and analysed again from now on.')}
      </Text>
      {setMaintenance.isError && <ErrorState error={setMaintenance.error} />}
    </ConfirmDialog>
  );
}

export function DeviceDetailPage() {
  const t = useT();
  const styles = useStyles();
  const { deviceId } = useParams<{ deviceId: string }>();
  const id = Number(deviceId);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useAppToast();

  // Opening a Device makes it the Device the other pages work with (see lib/selectedDevice.ts).
  const { setSelectedDeviceId } = useSelectedDevice();
  useEffect(() => {
    if (Number.isInteger(id)) setSelectedDeviceId(id);
  }, [id, setSelectedDeviceId]);

  // Polled so "Last heartbeat" keeps telling the truth while this page is
  // open - the Device reports liveness on its own, without any user action.
  const [deleted, setDeleted] = useState(false);
  const deviceQuery = useDevice(id, deleted ? undefined : POLL_INTERVALS_MS.deviceDetail);
  const sensorsQuery = useSensors(id);
  const principalQuery = useDevicePrincipal(id);
  const trainingQuery = useTrainingRequests(id);

  const [editing, setEditing] = useState(false);
  const updateDevice = useUpdateDevice(id);
  const disableDevice = useDisableDevice(id);
  const [nameDraft, setNameDraft] = useState('');
  const [zoneDraft, setZoneDraft] = useState(DEFAULT_DEVICE_TIME_ZONE);
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteDataOpen, setDeleteDataOpen] = useState(false);
  const [addSensorOpen, setAddSensorOpen] = useState(false);
  const [importSensorsOpen, setImportSensorsOpen] = useState(false);
  const [manageSetpointsOpen, setManageSetpointsOpen] = useState(false);
  const [importDescriptionsOpen, setImportDescriptionsOpen] = useState(false);
  const [editingSensorId, setEditingSensorId] = useState<number | null>(null);
  const [maintenanceSensorId, setMaintenanceSensorId] = useState<number | null>(null);
  const [maintenanceAllOpen, setMaintenanceAllOpen] = useState(false);
  const [visibilitySensorId, setVisibilitySensorId] = useState<number | null>(null);
  const [processingSensorId, setProcessingSensorId] = useState<number | null>(null);
  const [recalcSensorId, setRecalcSensorId] = useState<number | null>(null);
  const [recalcAllOpen, setRecalcAllOpen] = useState(false);
  const [bulkAggregationOpen, setBulkAggregationOpen] = useState(false);
  // A Recalc asked for while one runs joins the running job (it is not refused): the controls stay enabled.
  const recalcStatus = useRecalculationStatus(id);
  const calculatedUpTo = useCalculatedUpTo(id);
  const calculatedUpToBySensor = new Map((calculatedUpTo.data?.sensors ?? []).map((s) => [s.sensorId, s.calculatedUpTo] as const));

  if (deviceQuery.isLoading) return <LoadingState label={t('Loading device…')} />;
  if (deviceQuery.isError) return <ErrorState error={deviceQuery.error} onRetry={() => deviceQuery.refetch()} />;
  const device = deviceQuery.data;
  if (!device) return <EmptyState title={t('Device not found')} />;

  const editingSensor = sensorsQuery.data?.find((s) => s.id === editingSensorId) ?? null;
  const maintenanceSensor = sensorsQuery.data?.find((s) => s.id === maintenanceSensorId) ?? null;
  const processingSensor = sensorsQuery.data?.find((s) => s.id === processingSensorId) ?? null;
  const visibilitySensor = sensorsQuery.data?.find((s) => s.id === visibilitySensorId) ?? null;
  const sensorsInMaintenance = (sensorsQuery.data ?? []).filter((s) => s.maintenanceMode).length;

  const deviceZone = device.timeZone ?? DEFAULT_DEVICE_TIME_ZONE;
  const zones = timeZoneOptions(deviceZone);

  const startEdit = () => {
    setNameDraft(device.deviceName ?? '');
    setZoneDraft(deviceZone);
    setEditing(true);
  };

  const saveEdit = async () => {
    // The time zone is sent only when it changed: a change makes the API aggregate the Device's levels afresh in the new zone.
    await updateDevice.mutateAsync({ deviceName: nameDraft, ...(zoneDraft !== deviceZone ? { timeZone: zoneDraft } : {}) });
    toast.success(zoneDraft !== deviceZone ? t('Device updated; its aggregation levels are being recalculated in the new time zone') : t('Device updated'));
    setEditing(false);
  };

  return (
    <>
      <PageHeader
        title={device.deviceName || device.externalDeviceId || t('Device {0}', device.id)}
        titleDisplay="compact"
        description={`${device.applicationMode} · ${device.externalDeviceId}`}
        actions={
          isAdmin && (
            <>
              <Button icon={<Settings24Regular />} onClick={editing ? saveEdit : startEdit} disabled={updateDevice.isPending}>
                {editing ? (updateDevice.isPending ? t('Saving…') : t('Save')) : t('Edit')}
              </Button>
              <Button
                icon={<ShieldKeyhole24Regular />}
                onClick={() => navigate(`/devices/${id}/principal`)}
              >
                {t('DevicePrincipal')}</Button>
            </>
          )
        }
      />

      {editing && (
        <Card className={styles.card} style={{ marginBottom: tokens.spacingVerticalL, maxWidth: '420px' }}>
          <div className={styles.editForm}>
            <Field label={t('Name')}>
              <Input value={nameDraft} onChange={(_, d) => setNameDraft(d.value)} />
            </Field>
            <Field
              label={t('Time zone')}
              hint={t('Where the days of this machine start and end (midnight to midnight). Every aggregation level of the Device follows it. Changing it recalculates the aggregated values from the stored readings; the readings themselves are not touched.')}
            >
              <Select value={zoneDraft} onChange={(_, d) => setZoneDraft(d.value)}>
                {zones.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('Enabled')}>
              <Switch
                checked={device.enabled ?? false}
                label={device.enabled ? t('Enabled') : t('Disabled')}
                onChange={(_, d) =>
                  updateDevice.mutate(
                    { enabled: d.checked },
                    { onSuccess: () => toast.success(d.checked ? t('Device enabled') : t('Device disabled')) },
                  )
                }
              />
            </Field>
            {updateDevice.isError && <ErrorState error={updateDevice.error} />}
            <Button appearance="secondary" onClick={() => setEditing(false)}>
              {t('Close')}</Button>
            <Divider />
            <div className={styles.editForm}>
              <Body1Strong>{t('Danger zone')}</Body1Strong>
              <Text size={200}>{t('Permanently delete all data of the device - measurements, Issues, models (the device, its Sensors and their settings stay) - or the whole device with everything of it. Neither can be undone.')}</Text>
              <Button icon={<Delete24Regular />} onClick={() => setDeleteDataOpen(true)}>
                {t('Delete all data…')}</Button>
              <Button icon={<Delete24Regular />} onClick={() => setDeleteOpen(true)}>
                {t('Delete device…')}</Button>
            </div>
          </div>
        </Card>
      )}

      <div className={styles.grid}>
        <Card className={styles.card}>
          <Body1Strong>{t('Status')}</Body1Strong>
          <EnabledPill enabled={device.enabled} />
          <Text size={200}>{t('Last heartbeat:')}{' '}{formatRelative(device.heartBeat)}</Text>
          <Text size={200}>{t('Time zone:')}{' '}{deviceZone}</Text>
          <FreshnessPill freshness={freshnessOf(device.heartBeat)} />
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {formatDateTimeWithZone(device.heartBeat)}
          </Text>
        </Card>

        <Card className={styles.card}>
          <Body1Strong>{t('Machine access')}</Body1Strong>
          {principalQuery.isLoading && <LoadingState label="" />}
          {principalQuery.data === null && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {t('Not provisioned yet.')}</Text>
          )}
          {principalQuery.data && (
            <>
              <EnabledPill enabled={principalQuery.data.enabled} />
              <Text size={200}>{t('Last seen:')}{' '}{formatRelative(principalQuery.data.lastSeenAt)}</Text>
              <Text size={200}>{principalQuery.data.credentials?.length ?? 0} {t('credential(s)')}</Text>
            </>
          )}
        </Card>

        <Card className={styles.card}>
          <Body1Strong>{t('Training')}</Body1Strong>
          {trainingQuery.isLoading && <LoadingState label="" />}
          {trainingQuery.data && trainingQuery.data.length === 0 && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {t('No training requests yet.')}</Text>
          )}
          {trainingQuery.data && trainingQuery.data[0] && (
            <>
              <Text size={200}>{t('Latest:')}{' '}{trainingQuery.data[0].status}</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {formatRelative(trainingQuery.data[0].requestedAt)}
              </Text>
            </>
          )}
          <Button size="small" appearance="secondary" onClick={() => navigate('/training?deviceId=' + id)}>
            {t('View training')}</Button>
        </Card>
      </div>

      <Divider style={{ margin: `${tokens.spacingVerticalL} 0` }} />

      <PageHeader
        title={t('Sensors')}
        level="h2"
        actions={
          <>
            {isAdmin && (
              <Button icon={<AddCircle24Regular />} onClick={() => setAddSensorOpen(true)}>
                {t('Add Sensor')}</Button>
            )}
            {isAdmin && (
              <Button icon={<TableArrowUp24Regular />} onClick={() => setImportSensorsOpen(true)}>
                {t('Import Sensors')}</Button>
            )}
            {isAdmin && (
              <Button icon={<TargetEdit24Regular />} onClick={() => setManageSetpointsOpen(true)}>
                {t('Manage Setpoints')}</Button>
            )}
            {isAdmin && (
              <Button icon={<DocumentText24Regular />} onClick={() => setImportDescriptionsOpen(true)}>
                {t('Descriptions')}</Button>
            )}
            {isAdmin && (
              <Button
                icon={<ArrowSync24Regular />}
                onClick={() => setRecalcAllOpen(true)}
                disabled={!(sensorsQuery.data ?? []).some(isRecalculable)}
              >
                {t('Recalc all')}</Button>
            )}
            {isAdmin && (
              <Button icon={<DataBarVertical24Regular />} onClick={() => setBulkAggregationOpen(true)} disabled={(sensorsQuery.data ?? []).length === 0}>
                {t('Bulk aggregation')}</Button>
            )}
            {isAdmin && <ExportSensorMapButton device={device} sensors={sensorsQuery.data ?? []} />}
            {isAdmin && (
              <Button
                icon={<Wrench24Regular />}
                onClick={() => setMaintenanceAllOpen(true)}
                disabled={(sensorsQuery.data ?? []).length === 0}
              >
                {t('Maintenance (all Sensors)')}</Button>
            )}
            <Button icon={<ChartMultiple24Regular />} onClick={() => navigate(`/analytics?deviceId=${id}`)}>
              {t('Analyze')}</Button>
          </>
        }
      />

      <RecalculationProgress deviceId={id} isAdmin={isAdmin} />

      {sensorsQuery.isLoading && <LoadingState label={t('Loading sensors…')} />}
      {sensorsQuery.isError && <ErrorState error={sensorsQuery.error} onRetry={() => sensorsQuery.refetch()} />}
      {sensorsQuery.data && sensorsQuery.data.length === 0 && (
        <EmptyState
          title={t('No sensors configured')}
          description={isAdmin ? t('Add a Sensor to start collecting telemetry from this Device.') : t('This Device has no Sensors yet.')}
          action={
            isAdmin && (
              <>
                <Button icon={<AddCircle24Regular />} onClick={() => setAddSensorOpen(true)}>
                  {t('Add Sensor')}</Button>{' '}
                <Button icon={<TableArrowUp24Regular />} onClick={() => setImportSensorsOpen(true)}>
                  {t('Import Sensors')}</Button>
              </>
            )
          }
        />
      )}
      {sensorsInMaintenance > 0 && (
        <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>
            {sensorsInMaintenance === 1
              ? t('1 Sensor is in maintenance mode: the values the Device sends for it are ignored (not stored, not analysed).')
              : t('{0} Sensors are in maintenance mode: the values the Device sends for them are ignored (not stored, not analysed).', sensorsInMaintenance)}</MessageBarBody>
        </MessageBar>
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
                    {t('External Sensor ID')}: {sensor.externalSensorId}
                  </Text>
                  <br />
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {sensor.direction} {sensor.sensorType ? `· ${sensor.sensorType}` : ''}{' '}
                    {sensor.unitLabel ?? sensor.unitCode ? `(${sensor.unitLabel ?? sensor.unitCode})` : ''}
                  </Text>
                  <CalculatedUpToNote loaded={calculatedUpTo.data !== undefined} calculatedUpTo={calculatedUpToBySensor.get(sensor.id ?? -1)} />
                  <SensorRecalculationNote status={recalcStatus.data} sensorId={sensor.id} />
                </div>
                <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center' }}>
                  <MaintenancePill maintenanceMode={sensor.maintenanceMode} />
                  <ProcessingOffPill processingEnabled={sensor.processingEnabled} />
                  <HiddenPill visible={sensor.visible} />
                  <EnabledPill enabled={sensor.enabled} />
                  {isAdmin && (
                    <Button
                      size="small"
                      icon={<ArrowSync24Regular />}
                      aria-label={t('Recalculate {0} from the start', sensor.name || sensor.externalSensorId)}
                      title={recalcButtonTitle(sensor)}
                      disabled={!isRecalculable(sensor)}
                      onClick={() => setRecalcSensorId(sensor.id!)}
                    >
                      {t('Recalc')}</Button>
                  )}
                  {isAdmin && (
                    <Switch
                      aria-label={t('Calculation for {0}', sensor.name || sensor.externalSensorId)}
                      label={t('Calculate')}
                      checked={sensor.processingEnabled !== false}
                      onChange={() => setProcessingSensorId(sensor.id!)}
                    />
                  )}
                  {isAdmin && (
                    <Switch
                      aria-label={t('Visibility of {0} in Live Monitoring and Smart Analytics', sensor.name || sensor.externalSensorId)}
                      label={t('Visible')}
                      checked={sensor.visible !== false}
                      onChange={() => setVisibilitySensorId(sensor.id!)}
                    />
                  )}
                  {isAdmin && (
                    <Button size="small" icon={<Wrench24Regular />} onClick={() => setMaintenanceSensorId(sensor.id!)}>
                      {sensor.maintenanceMode ? t('End maintenance') : t('Maintenance')}
                    </Button>
                  )}
                  {isAdmin && (
                    <Button size="small" icon={<Edit24Regular />} onClick={() => setEditingSensorId(sensor.id!)}>
                      {t('Edit')}</Button>
                  )}
                  <Button size="small" onClick={() => navigate(`/devices/${id}/sensors/${sensor.id}/policies`)}>
                    {t('Policies')}</Button>
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}

      {sensorsQuery.data && sensorsQuery.data.length > 0 && <MaintenanceHistoryCard deviceId={id} sensors={sensorsQuery.data} isAdmin={isAdmin} />}

      {isAdmin && (
        <div style={{ marginTop: tokens.spacingVerticalXL }}>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {t('Disabling keeps all of the Device\'s data and can be undone. To remove a Device and all of its data for good, use Edit, then Delete device.')}</Text>
          <br />
          <Button
            appearance="secondary"
            disabled={!device.enabled || disableDevice.isPending}
            onClick={() => setDisableConfirmOpen(true)}
          >
            {disableDevice.isPending ? t('Disabling…') : t('Disable Device')}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={disableConfirmOpen}
        title={t('Disable this Device?')}
        intent="destructive"
        confirmLabel="Disable"
        busy={disableDevice.isPending}
        onConfirm={async () => {
          await disableDevice.disable();
          toast.success(t('Device disabled'));
          setDisableConfirmOpen(false);
        }}
        onCancel={() => setDisableConfirmOpen(false)}
      >
        <Text>
          {t('The Device stops accepting telemetry and its scheduled retraining eligibility pauses. There is no permanent delete - re-enable it later to resume normal operation.')}</Text>
      </ConfirmDialog>

      {isAdmin && (
        <NewSensorDialog
          deviceId={id}
          applicationMode={device.applicationMode}
          open={addSensorOpen}
          onClose={() => setAddSensorOpen(false)}
        />
      )}

      {isAdmin && deleteDataOpen && (
        <DeleteDeviceDataDialog
          deviceId={id}
          device={device}
          open={deleteDataOpen}
          onClose={() => setDeleteDataOpen(false)}
          onDeleted={(result) => {
            setDeleteDataOpen(false);
            toast.success(t('All data of "{0}" permanently deleted ({1} telemetry rows, {2} Issue(s), {3} model version(s); {4} Sensor(s) now empty).', result.deviceName || result.externalDeviceId, result.telemetryRowsDeleted, result.issuesDeleted ?? 0, result.modelVersionsDeleted ?? 0, result.sensorsAffected));
          }}
        />
      )}

      {isAdmin && deleteOpen && (
        <DeleteDeviceDialog
          deviceId={id}
          device={device}
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onDeleted={(result) => {
            setDeleted(true);
            toast.success(
              t('Device "{0}" permanently deleted ({1} Sensor(s), {2} telemetry rows, {3} Issue(s)).', result.deviceName || result.externalDeviceId, result.sensorsDeleted, result.telemetryRowsDeleted, result.issuesDeleted),
            );
            navigate('/devices');
          }}
        />
      )}

      {isAdmin && importDescriptionsOpen && (
        <DescriptionsDialog deviceId={id} deviceName={deviceQuery.data?.deviceName || deviceQuery.data?.externalDeviceId || `Device ${id}`} open={importDescriptionsOpen} onClose={() => setImportDescriptionsOpen(false)} />
      )}
      {isAdmin && manageSetpointsOpen && <ManageSetpointsDialog deviceId={id} open={manageSetpointsOpen} onClose={() => setManageSetpointsOpen(false)} />}

      {isAdmin && importSensorsOpen && (
        <SensorImportDialog
          deviceId={id}
          applicationMode={device.applicationMode}
          open={importSensorsOpen}
          onClose={() => setImportSensorsOpen(false)}
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

      {isAdmin && visibilitySensor && (
        <VisibilityDialog
          key={`${visibilitySensor.id}-${visibilitySensor.visible}`}
          deviceId={id}
          sensor={visibilitySensor}
          open={visibilitySensorId !== null}
          onClose={() => setVisibilitySensorId(null)}
        />
      )}

      {isAdmin && processingSensor && (
        <ProcessingDialog
          key={`${processingSensor.id}-${processingSensor.processingEnabled}`}
          deviceId={id}
          sensor={processingSensor}
          open={processingSensorId !== null}
          onClose={() => setProcessingSensorId(null)}
        />
      )}

      {isAdmin && (
        <MaintenanceAllDialog
          key={`all-${sensorsInMaintenance}-${sensorsQuery.data?.length ?? 0}`}
          deviceId={id}
          sensors={sensorsQuery.data ?? []}
          open={maintenanceAllOpen}
          onClose={() => setMaintenanceAllOpen(false)}
        />
      )}

      {isAdmin && (
        <RecalculateDialog
          key={`all-${recalcAllOpen}`}
          deviceId={id}
          sensors={sensorsQuery.data ?? []}
          open={recalcAllOpen}
          onClose={() => setRecalcAllOpen(false)}
        />
      )}

      {isAdmin && bulkAggregationOpen && (
        <BulkAggregationDialog deviceId={id} sensors={sensorsQuery.data ?? []} open onClose={() => setBulkAggregationOpen(false)} />
      )}

      {isAdmin && recalcSensorId !== null && (
        <RecalculateDialog
          key={`one-${recalcSensorId}`}
          deviceId={id}
          sensor={(sensorsQuery.data ?? []).find((s) => s.id === recalcSensorId)}
          sensors={sensorsQuery.data ?? []}
          open
          onClose={() => setRecalcSensorId(null)}
        />
      )}

      {isAdmin && maintenanceSensor && (
        <MaintenanceDialog
          key={`${maintenanceSensor.id}-${maintenanceSensor.maintenanceMode}`}
          deviceId={id}
          sensor={maintenanceSensor}
          open={maintenanceSensorId !== null}
          onClose={() => setMaintenanceSensorId(null)}
        />
      )}
    </>
  );
}
