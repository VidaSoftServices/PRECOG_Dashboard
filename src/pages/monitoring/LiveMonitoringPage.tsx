import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Text,
  Body1Strong,
  Select,
  Button,
  Switch,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowClockwise24Regular, DataTrending24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { FreshnessPill } from '@/components/StatusPill';
import { TelemetryChart } from '@/components/charts/TelemetryChart';
import { useDevices, useDevice } from '@/api/hooks/devices';
import { useSensors } from '@/api/hooks/sensors';
import { useTelemetryTrailingPeriods, familyFor, isCurveFamily } from '@/api/hooks/telemetry';
import { useNumberSearchParam } from '@/lib/useNumberSearchParam';
import { usePageVisible } from '@/lib/usePageVisible';
import { formatRelative, formatDateTime, freshnessOf } from '@/lib/dateTime';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';
import { useLiveMonitoringSchedule, type RotationSensor } from './useLiveMonitoringSchedule';
import type { SensorDto } from '@/api/hooks/sensors';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  statusBar: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  card: {
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  valueRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  bigValue: {
    fontSize: tokens.fontSizeHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
});

function SensorLiveCard({ deviceId, sensor, applicationMode }: { deviceId: number; sensor: SensorDto; applicationMode: 'continuous' | 'periodic' }) {
  const styles = useStyles();
  const family = familyFor(applicationMode, sensor.direction);
  const curveFamily = isCurveFamily(family);

  // Passive subscription only - see telemetry.ts's doc comment. This card
  // never triggers its own fetch; it just reads whatever the page-level
  // useLiveMonitoringSchedule orchestrator last wrote for this Sensor's key.
  const trailing = useTelemetryTrailingPeriods({ family, deviceId, sensorId: sensor.id, periods: 20 });

  const latest = trailing.data?.[trailing.data.length - 1];
  const neverFetched = trailing.data === undefined;

  return (
    <Card className={styles.card}>
      <div className={styles.valueRow}>
        <Body1Strong>{sensor.name || sensor.externalSensorId}</Body1Strong>
        {!curveFamily && <FreshnessPill freshness={freshnessOf(latest?.measured)} />}
      </div>

      {curveFamily ? (
        <EmptyState
          title="Not applicable to Periodic Sensors"
          description="Curve runs aren't a regular clock tick - use Smart Analytics to inspect the most recent curve period for this Sensor."
        />
      ) : trailing.isError ? (
        <ErrorState error={trailing.error} />
      ) : neverFetched ? (
        // Real, honest state - the rotation hasn't reached this Sensor yet
        // (see CLAUDE.md's "Live Monitoring" section: ~25 Sensors cannot all
        // refresh every 3s under the confirmed API rate limit, so this is
        // shown rather than a spinner that would never resolve, or a faked
        // "live" value). trailing.isFetching flips true once this Sensor's
        // turn actually comes up.
        <LoadingState label={trailing.isFetching ? 'Refreshing…' : 'Waiting for first refresh…'} />
      ) : (
        <>
          <div className={styles.valueRow}>
            <span className={styles.bigValue}>{latest?.actual ?? '—'}</span>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {latest ? formatRelative(latest.measured) : 'no data'}
            </Text>
          </div>
          <TelemetryChart
            series={[{ label: sensor.name || sensor.externalSensorId || 'Sensor', points: trailing.data ?? [], bidirectional: sensor.direction === 'bidirectional' }]}
            height={160}
            mode="single"
          />
          <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
            {trailing.isFetching ? 'Refreshing…' : `Dashboard checked ${formatRelative(new Date(trailing.dataUpdatedAt))}`}
          </Text>
        </>
      )}
    </Card>
  );
}

function RateLimitBanner({ cooldownUntil }: { cooldownUntil: Date }) {
  return (
    <MessageBar intent="warning" role="status">
      <MessageBarBody>
        <MessageBarTitle>Too many requests</MessageBarTitle>
        Live Monitoring is pausing its refresh cycle - the API asked every client on this network to slow down.
        Existing readings stay visible. Retrying automatically around {formatDateTime(cooldownUntil)}.
      </MessageBarBody>
    </MessageBar>
  );
}

export function LiveMonitoringPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const pageVisible = usePageVisible();
  const [deviceId, setDeviceId] = useNumberSearchParam('deviceId');
  const [live, setLive] = useState(true);

  const devicesQuery = useDevices();
  const deviceQuery = useDevice(deviceId);
  const sensorsQuery = useSensors(deviceId);

  const effectiveLive = live && pageVisible;

  const devices = devicesQuery.data ?? [];
  const selectedId = deviceId ?? devices[0]?.id;
  const applicationMode = deviceQuery.data?.applicationMode as 'continuous' | 'periodic' | undefined;

  // Only Sensors with a real trailing-periods concept belong in the
  // rotation - a curve Sensor's card never fetches anything (see
  // SensorLiveCard), so including it would just waste a turn every sweep.
  const rotationSensors = useMemo<RotationSensor[]>(() => {
    if (!applicationMode) return [];
    return (sensorsQuery.data ?? [])
      .map((sensor) => ({ id: sensor.id!, family: familyFor(applicationMode, sensor.direction) }))
      .filter((s) => !isCurveFamily(s.family));
  }, [sensorsQuery.data, applicationMode]);

  const schedule = useLiveMonitoringSchedule({
    active: effectiveLive && selectedId !== undefined,
    deviceId: selectedId,
    sensors: rotationSensors,
    periods: 20,
    intervalMs: POLL_INTERVALS_MS.liveMonitoringCycle,
  });

  // Defaulting to the first Device must happen as an effect, not directly in
  // the render body - calling setDeviceId (which itself calls React
  // Router's setSearchParams) during render triggers "Cannot update a
  // component while rendering a different component" and updates a
  // sibling/ancestor router state outside React's expected render phase.
  // Must run unconditionally (before the loading/error early returns below)
  // - React Hooks can never be called after an early return.
  useEffect(() => {
    if (selectedId !== undefined && deviceId === undefined) setDeviceId(selectedId);
  }, [selectedId, deviceId, setDeviceId]);

  if (devicesQuery.isLoading) return <LoadingState label="Loading devices…" />;
  if (devicesQuery.isError) return <ErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />;

  const refreshDisabled = schedule.cooldownUntil !== null || schedule.activeSensorId !== null;

  return (
    <>
      <PageHeader
        title="Live Monitoring"
        description="Current operational state - latest readings, freshness, and active warnings. For historical exploration and comparison, use Smart Analytics."
        actions={
          selectedId !== undefined && (
            <Button
              icon={<DataTrending24Regular />}
              onClick={() => navigate(`/analytics?deviceId=${selectedId}`)}
            >
              Open in Smart Analytics
            </Button>
          )
        }
      />

      <div className={styles.toolbar}>
        <Select aria-label="Device" value={selectedId !== undefined ? String(selectedId) : ''} onChange={(_, d) => setDeviceId(Number(d.value))}>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.deviceName || d.externalDeviceId}
            </option>
          ))}
        </Select>
        <Switch checked={live} onChange={(_, d) => setLive(d.checked)} label={live ? `Live (rotating refresh, every ${POLL_INTERVALS_MS.liveMonitoringCycle / 1000}s)` : 'Paused'} />
        <Button icon={<ArrowClockwise24Regular />} onClick={schedule.refreshNow} disabled={refreshDisabled}>
          Refresh now
        </Button>
        {!pageVisible && live && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Paused - tab not visible
          </Text>
        )}
      </div>

      <div className={styles.statusBar}>
        {schedule.cooldownUntil ? (
          <RateLimitBanner cooldownUntil={schedule.cooldownUntil} />
        ) : (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {schedule.lastTickAt
              ? `Rotation cycle last advanced ${formatRelative(schedule.lastTickAt)} - each Sensor refreshes roughly every ${Math.round((rotationSensors.length * POLL_INTERVALS_MS.liveMonitoringCycle) / 1000)}s, one at a time, to stay within the API's rate limit (see CLAUDE.md).`
              : live && rotationSensors.length > 0
                ? 'Starting rotation…'
                : null}
          </Text>
        )}
      </div>

      {deviceQuery.isError && <ErrorState error={deviceQuery.error} />}
      {sensorsQuery.isLoading && <LoadingState label="Loading sensors…" />}
      {sensorsQuery.isError && <ErrorState error={sensorsQuery.error} onRetry={() => sensorsQuery.refetch()} />}
      {sensorsQuery.data && sensorsQuery.data.length === 0 && <EmptyState title="No sensors on this Device" />}

      {deviceQuery.data && sensorsQuery.data && sensorsQuery.data.length > 0 && (
        <div className={styles.grid}>
          {sensorsQuery.data.map((sensor) => (
            <SensorLiveCard
              key={sensor.id}
              deviceId={selectedId!}
              sensor={sensor}
              applicationMode={deviceQuery.data.applicationMode as 'continuous' | 'periodic'}
            />
          ))}
        </div>
      )}
    </>
  );
}
