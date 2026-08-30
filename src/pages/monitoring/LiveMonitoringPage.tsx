import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Text,
  Body1Strong,
  Select,
  Button,
  Switch,
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
import { toApiIso, formatRelative, freshnessOf } from '@/lib/dateTime';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';
import type { SensorDto } from '@/api/hooks/sensors';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
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

function SensorLiveCard({ deviceId, sensor, applicationMode, live }: { deviceId: number; sensor: SensorDto; applicationMode: 'continuous' | 'periodic'; live: boolean }) {
  const styles = useStyles();
  const family = familyFor(applicationMode, sensor.direction);
  const curveFamily = isCurveFamily(family);

  // Curve (Periodic) Sensors have no "trailing periods" concept - a curve
  // run isn't a regular clock tick. Live Monitoring for those shows the
  // freshest thing the API can give without downloading a full range: the
  // Sensor's own heartbeat-adjacent state is not separately exposed, so this
  // is flagged rather than faked - see the empty state below.
  const trailing = useTelemetryTrailingPeriods({
    family,
    deviceId,
    sensorId: sensor.id,
    endDate: toApiIso(new Date()),
    periods: 20,
    live,
  });

  const latest = trailing.data?.[trailing.data.length - 1];

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
      ) : trailing.isLoading ? (
        <LoadingState label="" />
      ) : trailing.isError ? (
        <ErrorState error={trailing.error} onRetry={() => trailing.refetch()} />
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
        </>
      )}
    </Card>
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
        <Switch checked={live} onChange={(_, d) => setLive(d.checked)} label={live ? `Live (every ${POLL_INTERVALS_MS.liveCompactChart / 1000}s)` : 'Paused'} />
        <Button icon={<ArrowClockwise24Regular />} onClick={() => sensorsQuery.refetch()}>
          Refresh now
        </Button>
        {!pageVisible && live && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Paused - tab not visible
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
              live={effectiveLive}
            />
          ))}
        </div>
      )}
    </>
  );
}
