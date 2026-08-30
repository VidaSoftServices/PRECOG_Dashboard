import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Text,
  Body1Strong,
  Select,
  Checkbox,
  RadioGroup,
  Radio,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Share24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { DateTimeField } from '@/components/DateTimeField';
import { TelemetryChart } from '@/components/charts/TelemetryChart';
import { ReviewStatePill } from '@/components/StatusPill';
import { useDevices, useDevice } from '@/api/hooks/devices';
import { useSensors } from '@/api/hooks/sensors';
import { useAggregationPolicies } from '@/api/hooks/aggregationPolicies';
import { useTelemetryDateRange, familyFor } from '@/api/hooks/telemetry';
import { useKnowledgeCompatibility } from '@/api/hooks/knowledgeSharing';
import { useIssues } from '@/api/hooks/issues';
import { useNumberSearchParam } from '@/lib/useNumberSearchParam';
import { toApiIso, formatDateTime, parseApiDate } from '@/lib/dateTime';
import { useAuth } from '@/auth/AuthContext';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalL,
    alignItems: 'flex-end',
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  sensorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  card: {
    padding: tokens.spacingVerticalM,
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 300px',
    gap: tokens.spacingHorizontalL,
  },
  layoutMobile: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: tokens.spacingHorizontalL,
  },
});

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Single-Device, multiple-Sensor overlay mode (decision #16). */
function SingleDeviceAnalytics({ deviceId, start, end }: { deviceId: number; start: Date; end: Date }) {
  const styles = useStyles();
  const deviceQuery = useDevice(deviceId);
  const sensorsQuery = useSensors(deviceId);
  const [selectedSensorIds, setSelectedSensorIds] = useState<number[]>([]);

  const sensors = sensorsQuery.data ?? [];
  const effectiveSelection = selectedSensorIds.length > 0 ? selectedSensorIds : sensors.slice(0, 1).map((s) => s.id!);
  const primarySensor = sensors.find((s) => s.id === effectiveSelection[0]);

  const policiesQuery = useAggregationPolicies(deviceId, primarySensor?.id);
  const issuesQuery = useIssues(deviceId, { includeMembers: false, take: 200 });

  // Rules of Hooks: call one telemetry query per potential sensor slot, up to
  // a small fixed cap, rather than calling useTelemetryDateRange inside a
  // .map() (which would violate conditional-hook-count rules as selection changes).
  const MAX_OVERLAY_SENSORS = 4;
  const slots = [0, 1, 2, 3] as const;
  const queries = slots.map((i) => {
    const sensorId = effectiveSelection[i];
    const family = familyFor((deviceQuery.data?.applicationMode as 'continuous' | 'periodic') ?? 'continuous', sensors.find((s) => s.id === sensorId)?.direction);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useTelemetryDateRange({
      family,
      deviceId,
      sensorId,
      startDate: toApiIso(start),
      endDate: toApiIso(end),
      take: 2000,
    });
  });

  if (sensorsQuery.isLoading || deviceQuery.isLoading) return <LoadingState label="Loading sensors…" />;
  if (sensorsQuery.isError) return <ErrorState error={sensorsQuery.error} onRetry={() => sensorsQuery.refetch()} />;
  if (sensors.length === 0) return <EmptyState title="This Device has no Sensors yet" />;

  const series = effectiveSelection
    .map((sensorId, i) => {
      const sensor = sensors.find((s) => s.id === sensorId);
      const q = queries[i];
      if (!sensor || !q) return null;
      return { label: sensor.name || sensor.externalSensorId || `Sensor ${sensorId}`, points: q.data ?? [], bidirectional: sensor.direction === 'bidirectional' };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const anyLoading = queries.some((q) => q.isLoading);
  const firstError = queries.find((q) => q.isError);

  const issuesInRange = (issuesQuery.data ?? []).filter((issue) => {
    const at = parseApiDate(issue.measuredAtTo ?? issue.measuredAtFrom);
    return at && at >= start && at <= end;
  });

  return (
    <div className={styles.layout}>
      <div>
        <Card className={styles.card}>
          <Body1Strong>Sensors ({effectiveSelection.length} of {Math.min(sensors.length, MAX_OVERLAY_SENSORS)} shown, max {MAX_OVERLAY_SENSORS})</Body1Strong>
          <div className={styles.sensorList} style={{ marginTop: tokens.spacingVerticalS }}>
            {sensors.map((sensor) => (
              <Checkbox
                key={sensor.id}
                label={`${sensor.name || sensor.externalSensorId} (${sensor.direction})`}
                checked={effectiveSelection.includes(sensor.id!)}
                onChange={(_, d) => {
                  setSelectedSensorIds((prev) => {
                    const base = prev.length > 0 ? prev : sensors.slice(0, 1).map((s) => s.id!);
                    if (d.checked) {
                      if (base.length >= MAX_OVERLAY_SENSORS) return base;
                      return [...base, sensor.id!];
                    }
                    return base.filter((id) => id !== sensor.id);
                  });
                }}
              />
            ))}
          </div>

          {anyLoading && <LoadingState label="Loading telemetry…" />}
          {firstError && <ErrorState error={firstError.error} />}
          {!anyLoading && !firstError && (
            <TelemetryChart
              series={series}
              mode={series.length > 1 ? 'compare' : 'single'}
              showControlLimits={series.length === 1}
              height={360}
            />
          )}
        </Card>

        <Card className={styles.card} style={{ marginTop: tokens.spacingVerticalM }}>
          <Body1Strong>Issues in range ({issuesInRange.length})</Body1Strong>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: tokens.spacingVerticalS }}>
            Filtered locally over the currently loaded bounded Issue list for this Device - not a server-side search of all history.
          </Text>
          {issuesInRange.length === 0 && <Text size={200}>No Issues in this range.</Text>}
          {issuesInRange.map((issue) => (
            <div key={issue.id} style={{ display: 'flex', justifyContent: 'space-between', padding: `${tokens.spacingVerticalXS} 0` }}>
              <Text size={200}>{formatDateTime(issue.measuredAtFrom)} → {formatDateTime(issue.measuredAtTo)}</Text>
              <ReviewStatePill reviewState={issue.reviewState} />
            </div>
          ))}
        </Card>
      </div>

      <Card className={styles.card}>
        <Body1Strong>Aggregation policies</Body1Strong>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          For {primarySensor?.name || primarySensor?.externalSensorId} - reference only, telemetry reads always return the Sensor's primary measured signal.
        </Text>
        {policiesQuery.isLoading && <LoadingState label="" />}
        {policiesQuery.data?.map((policy) => (
          <div key={policy.id} style={{ marginTop: tokens.spacingVerticalS }}>
            <Text weight="semibold" size={200}>
              {policy.sourceDataKey} · {policy.timeScale}
            </Text>
            <br />
            <Text size={200}>
              Lookback {policy.lookback} {policy.scale} · Min issue score {policy.minIssueScore}
            </Text>
          </div>
        ))}
      </Card>
    </div>
  );
}

/** Two-Device comparison mode with compatibility-aware Sensor mapping (decision #17). */
function DeviceComparisonAnalytics({ deviceIdA, deviceIdB, start, end }: { deviceIdA: number; deviceIdB: number; start: Date; end: Date }) {
  const styles = useStyles();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const sensorsA = useSensors(deviceIdA);
  const sensorsB = useSensors(deviceIdB);
  const deviceA = useDevice(deviceIdA);
  const deviceB = useDevice(deviceIdB);
  const compatibility = useKnowledgeCompatibility(deviceIdA, deviceIdB);

  const [sensorIdA, setSensorIdA] = useState<number | undefined>();
  const [sensorIdB, setSensorIdB] = useState<number | undefined>();

  const effectiveSensorA = sensorIdA ?? sensorsA.data?.[0]?.id;
  const effectiveSensorB = sensorIdB ?? sensorsB.data?.[0]?.id;

  const familyA = familyFor((deviceA.data?.applicationMode as 'continuous' | 'periodic') ?? 'continuous', sensorsA.data?.find((s) => s.id === effectiveSensorA)?.direction);
  const familyB = familyFor((deviceB.data?.applicationMode as 'continuous' | 'periodic') ?? 'continuous', sensorsB.data?.find((s) => s.id === effectiveSensorB)?.direction);

  const dataA = useTelemetryDateRange({ family: familyA, deviceId: deviceIdA, sensorId: effectiveSensorA, startDate: toApiIso(start), endDate: toApiIso(end), take: 2000 });
  const dataB = useTelemetryDateRange({ family: familyB, deviceId: deviceIdB, sensorId: effectiveSensorB, startDate: toApiIso(start), endDate: toApiIso(end), take: 2000 });

  const stream = compatibility.data?.streams?.find(
    (s) => s.sourceSensorId === effectiveSensorA || s.targetSensorId === effectiveSensorB,
  );
  const provenCompatible = compatibility.data?.fullyCompatible || stream?.compatible;

  if (sensorsA.isLoading || sensorsB.isLoading || compatibility.isLoading) return <LoadingState label="Checking compatibility…" />;

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.column}>
          <Text size={200}>Device A Sensor</Text>
          <Select aria-label="Device A Sensor" value={effectiveSensorA !== undefined ? String(effectiveSensorA) : ''} onChange={(_, d) => setSensorIdA(Number(d.value))}>
            {sensorsA.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.externalSensorId}
              </option>
            ))}
          </Select>
        </div>
        <div className={styles.column}>
          <Text size={200}>Device B Sensor</Text>
          <Select aria-label="Device B Sensor" value={effectiveSensorB !== undefined ? String(effectiveSensorB) : ''} onChange={(_, d) => setSensorIdB(Number(d.value))}>
            {sensorsB.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.externalSensorId}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!provenCompatible && (
        <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>
            <MessageBarTitle>Not proven compatible</MessageBarTitle>
            {stream?.failures?.join(' ') ??
              'These Sensors have not been proven compatible (matching QuantityKind, convertible units, and matching aggregation configuration). Shown side by side rather than overlaid.'}
          </MessageBarBody>
        </MessageBar>
      )}

      {provenCompatible ? (
        <Card className={styles.card}>
          <TelemetryChart
            series={[
              { label: `${deviceA.data?.deviceName ?? 'Device A'}`, points: dataA.data ?? [] },
              { label: `${deviceB.data?.deviceName ?? 'Device B'}`, points: dataB.data ?? [] },
            ]}
            mode="compare"
            height={380}
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacingHorizontalM }}>
          <Card className={styles.card}>
            <Body1Strong>{deviceA.data?.deviceName ?? 'Device A'}</Body1Strong>
            <TelemetryChart series={[{ label: 'A', points: dataA.data ?? [] }]} mode="single" height={300} />
          </Card>
          <Card className={styles.card}>
            <Body1Strong>{deviceB.data?.deviceName ?? 'Device B'}</Body1Strong>
            <TelemetryChart series={[{ label: 'B', points: dataB.data ?? [] }]} mode="single" height={300} />
          </Card>
        </div>
      )}

      {isAdmin && (
        <div style={{ marginTop: tokens.spacingVerticalM }}>
          <Button icon={<Share24Regular />} onClick={() => navigate(`/knowledge-sharing?sourceDeviceId=${deviceIdA}&targetDeviceId=${deviceIdB}`)}>
            Start knowledge sharing between these Devices
          </Button>
          <Text size={200} style={{ display: 'block', color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXXS }}>
            This comparison view only visualizes data - it does not itself approve sharing, remap Sensors, or affect training.
          </Text>
        </div>
      )}
    </div>
  );
}

export function SmartAnalyticsPage() {
  const styles = useStyles();
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [deviceIdA, setDeviceIdA] = useNumberSearchParam('deviceId');
  const [deviceIdB, setDeviceIdB] = useNumberSearchParam('compareDeviceId');
  const [range, setRange] = useState(defaultRange);

  const devicesQuery = useDevices();
  const devices = devicesQuery.data ?? [];

  const effectiveA = deviceIdA ?? devices[0]?.id;

  const validationMessage = range.start >= range.end ? 'Start must be before end.' : undefined;

  if (devicesQuery.isLoading) return <LoadingState label="Loading devices…" />;
  if (devicesQuery.isError) return <ErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />;

  return (
    <>
      <PageHeader title="Smart Analytics" description="Historical exploration, multi-Sensor comparison, and two-Device comparison." />

      <div className={styles.toolbar}>
        <RadioGroup value={mode} onChange={(_, d) => setMode(d.value as 'single' | 'compare')} layout="horizontal">
          <Radio value="single" label="Single Device" />
          <Radio value="compare" label="Compare Devices" />
        </RadioGroup>

        <div className={styles.column}>
          <Text size={200}>{mode === 'compare' ? 'Device A' : 'Device'}</Text>
          <Select aria-label={mode === 'compare' ? 'Device A' : 'Device'} value={effectiveA !== undefined ? String(effectiveA) : ''} onChange={(_, d) => setDeviceIdA(Number(d.value))}>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.deviceName || d.externalDeviceId}
              </option>
            ))}
          </Select>
        </div>

        {mode === 'compare' && (
          <div className={styles.column}>
            <Text size={200}>Device B</Text>
            <Select aria-label="Device B" value={deviceIdB !== undefined ? String(deviceIdB) : ''} onChange={(_, d) => setDeviceIdB(Number(d.value))}>
              <option value="">Select…</option>
              {devices.filter((d) => d.id !== effectiveA).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.deviceName || d.externalDeviceId}
                </option>
              ))}
            </Select>
          </div>
        )}

        <DateTimeField label="Start" value={range.start} onChange={(d) => d && setRange((r) => ({ ...r, start: d }))} maxDate={range.end} />
        <DateTimeField label="End" value={range.end} onChange={(d) => d && setRange((r) => ({ ...r, end: d }))} minDate={range.start} validationMessage={validationMessage} />
      </div>

      {validationMessage && (
        <MessageBar intent="error" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>{validationMessage}</MessageBarBody>
        </MessageBar>
      )}

      {effectiveA !== undefined && !validationMessage && mode === 'single' && (
        <SingleDeviceAnalytics deviceId={effectiveA} start={range.start} end={range.end} />
      )}

      {effectiveA !== undefined && deviceIdB !== undefined && !validationMessage && mode === 'compare' && (
        <DeviceComparisonAnalytics deviceIdA={effectiveA} deviceIdB={deviceIdB} start={range.start} end={range.end} />
      )}

      {mode === 'compare' && deviceIdB === undefined && <EmptyState title="Select a second Device to compare" />}
    </>
  );
}
