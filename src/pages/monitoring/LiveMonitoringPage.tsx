import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Text,
  Body1Strong,
  Select,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Input,
  Spinner,
  Switch,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular, ArrowClockwise16Regular, ArrowClockwise24Regular, FullScreenMaximize16Regular, ChevronLeft24Regular, ChevronRight24Regular, DataTrending24Regular, Search24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { FreshnessPill, MaintenancePill } from '@/components/StatusPill';
import { TelemetryChart } from '@/components/charts/TelemetryChart';
import { useDevices, useDevice } from '@/api/hooks/devices';
import { useSensors } from '@/api/hooks/sensors';
import { useTelemetryTrailingPeriods, familyFor, isCurveFamily } from '@/api/hooks/telemetry';
import { useDeviceSelection } from '@/lib/selectedDevice';
import { filterSensors } from '@/lib/sensorFilter';
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
    marginBottom: tokens.spacingVerticalS,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  pager: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  explanation: {
    display: 'block',
    marginBottom: tokens.spacingVerticalL,
    color: tokens.colorNeutralForeground3,
  },
  search: { minWidth: '260px' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  card: {
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  chartArea: {
    cursor: 'zoom-in',
  },
  dialogSurface: {
    // About 15% of the window stays free around the enlarged chart.
    width: '85vw',
    maxWidth: '85vw',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
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

function SensorLiveCard({
  deviceId,
  sensor,
  applicationMode,
  refreshing,
  refreshDisabled,
  onRefresh,
}: {
  deviceId: number;
  sensor: SensorDto;
  applicationMode: 'continuous' | 'periodic';
  /** This Sensor's manual refresh is in flight. */
  refreshing: boolean;
  /** Another Live Monitoring request is in flight, or the API asked us to slow down. */
  refreshDisabled: boolean;
  onRefresh: () => void;
}) {
  const styles = useStyles();
  const family = familyFor(applicationMode, sensor.direction);
  const curveFamily = isCurveFamily(family);

  // Passive subscription only - see telemetry.ts's doc comment. This card
  // never triggers its own fetch; it just reads whatever the page-level
  // useLiveMonitoringSchedule orchestrator last wrote for this Sensor's key.
  const trailing = useTelemetryTrailingPeriods({ family, deviceId, sensorId: sensor.id, periods: 20 });

  const latest = trailing.data?.[trailing.data.length - 1];
  const neverFetched = trailing.data === undefined;
  const [enlarged, setEnlarged] = useState(false);
  const sensorLabel = sensor.name || sensor.externalSensorId || 'Sensor';
  // One definition for the card and the enlarged view, so the modal always shows exactly the data the card has (it moves with every refresh).
  const chartSeries = [{ label: sensorLabel, points: trailing.data ?? [], bidirectional: sensor.direction === 'bidirectional', unitLabel: sensor.unitLabel }];

  return (
    <Card className={styles.card}>
      <div className={styles.valueRow}>
        <Body1Strong>{sensor.name || sensor.externalSensorId}</Body1Strong>
        <div className={styles.headerActions}>
          {/* A Sensor in maintenance is being ignored on purpose, so its aging data must read as maintenance, not as a silent (stale) Sensor. */}
          {!curveFamily && (sensor.maintenanceMode ? <MaintenancePill maintenanceMode /> : <FreshnessPill freshness={freshnessOf(latest?.measured)} />)}
          {/* One-off refresh of just this Sensor; a curve Sensor has no trailing-periods reading to refresh. */}
          {!curveFamily && !neverFetched && !trailing.isError && (
            <Button
              appearance="subtle"
              size="small"
              icon={<FullScreenMaximize16Regular />}
              aria-label={`Enlarge chart of ${sensorLabel}`}
              title="Open the chart in a large window"
              onClick={() => setEnlarged(true)}
            />
          )}
          {!curveFamily && (
            <Button
              appearance="subtle"
              size="small"
              icon={refreshing ? <Spinner size="extra-tiny" /> : <ArrowClockwise16Regular />}
              aria-label={`Refresh ${sensor.name || sensor.externalSensorId}`}
              title="Refresh this Sensor now"
              disabled={refreshDisabled || refreshing}
              onClick={onRefresh}
            />
          )}
        </div>
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
          {/* Clicking the chart opens it large (mouse convenience); the keyboard and screen-reader route is the "Enlarge" button above. */}
          <div className={styles.chartArea} onClick={() => setEnlarged(true)}>
            <TelemetryChart series={chartSeries} height={160} mode="single" timeAxis="time" compact />
          </div>
        </>
      )}
      <Dialog open={enlarged} onOpenChange={(_, d) => setEnlarged(d.open)}>
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle
              action={
                <div className={styles.headerActions}>
                  {/* The same one-off refresh as the card's icon, so the enlarged chart can be refreshed without closing it. */}
                  <Button
                    appearance="subtle"
                    icon={refreshing ? <Spinner size="tiny" /> : <ArrowClockwise16Regular />}
                    aria-label={`Refresh ${sensorLabel}`}
                    title="Refresh this Sensor now"
                    disabled={refreshDisabled || refreshing}
                    onClick={onRefresh}
                  />
                  <DialogTrigger disableButtonEnhancement action="close">
                    <Button appearance="subtle" aria-label="Close" icon={<Dismiss24Regular />} />
                  </DialogTrigger>
                </div>
              }
            >
              {sensorLabel}
            </DialogTitle>
            <DialogContent>
              <div className={styles.valueRow}>
                <span className={styles.bigValue}>{latest?.actual ?? '—'}</span>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {latest ? `${formatDateTime(latest.measured)} (${formatRelative(latest.measured)})` : 'no data'}
                </Text>
              </div>
              <TelemetryChart series={chartSeries} height="calc(85vh - 230px)" mode="single" showControlLimits timeAxis="fullDateTime" emphasizeHover />
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setEnlarged(false)}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
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

const PAGE_SIZES = [10, 25, 50] as const;

/** Lags the value behind by delayMs, so typing in the filter does not restart the refresh rotation on every keystroke. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

export function LiveMonitoringPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const pageVisible = usePageVisible();
  const [live, setLive] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);
  const filter = useDebounced(filterText.trim().toLowerCase(), 500);

  const devicesQuery = useDevices();
  // The Device chosen on any page stays chosen while moving between menu items (see lib/selectedDevice.ts).
  const [selectedId, setDeviceId] = useDeviceSelection(devicesQuery.data);
  const deviceQuery = useDevice(selectedId);
  const sensorsQuery = useSensors(selectedId);

  const effectiveLive = live && pageVisible;

  const devices = devicesQuery.data ?? [];
  const applicationMode = deviceQuery.data?.applicationMode as 'continuous' | 'periodic' | undefined;

  // What the page shows is what it keeps fresh: a Device can have hundreds of Sensors, and one request every
  // few seconds could never keep all of them current, so only the Sensors on screen (after the filter, one page of them)
  // are in the rotation. Narrow the filter or turn the page to watch others.
  const filtered = useMemo(() => filterSensors(sensorsQuery.data ?? [], filter), [sensorsQuery.data, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const shown = useMemo(() => filtered.slice(safePage * pageSize, safePage * pageSize + pageSize), [filtered, safePage, pageSize]);

  // Only Sensors with a real trailing-periods concept belong in the rotation - a curve Sensor's card never fetches anything
  // (see SensorLiveCard), so including it would just waste a turn every sweep.
  const rotationSensors = useMemo<RotationSensor[]>(() => {
    if (!applicationMode) return [];
    return shown
      .map((sensor) => ({ id: sensor.id!, family: familyFor(applicationMode, sensor.direction) }))
      .filter((s) => !isCurveFamily(s.family));
  }, [shown, applicationMode]);

  const schedule = useLiveMonitoringSchedule({
    active: effectiveLive && selectedId !== undefined,
    deviceId: selectedId,
    sensors: rotationSensors,
    periods: 20,
    intervalMs: POLL_INTERVALS_MS.liveMonitoringCycle,
  });

  useEffect(() => {
    setPage(0);
  }, [filter, pageSize, selectedId]);

  if (devicesQuery.isLoading) return <LoadingState label="Loading devices…" />;
  if (devicesQuery.isError) return <ErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />;

  const refreshDisabled = schedule.cooldownUntil !== null || schedule.activeSensorId !== null || schedule.manualSensorId !== null;
  const refreshing = schedule.manualProgress;
  const firstShown = filtered.length === 0 ? 0 : safePage * pageSize + 1;
  const lastShown = safePage * pageSize + shown.length;
  const seconds = POLL_INTERVALS_MS.liveMonitoringCycle / 1000;

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
        <Input
          className={styles.search}
          type="search"
          aria-label="Filter Sensors"
          placeholder="Filter Sensors by name…"
          contentBefore={<Search24Regular />}
          value={filterText}
          onChange={(_, d) => setFilterText(d.value)}
        />
        <Select aria-label="Sensors per page" value={String(pageSize)} onChange={(_, d) => setPageSize(Number(d.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} per page
            </option>
          ))}
        </Select>
        <Switch checked={live} onChange={(_, d) => setLive(d.checked)} label={live ? 'Live: shown Sensors refresh in turn' : 'Paused'} />
        {!pageVisible && live && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Paused - tab not visible
          </Text>
        )}
      </div>

      {sensorsQuery.data && sensorsQuery.data.length > 0 && (
        <div className={styles.statusBar}>
          <div className={styles.pager}>
            <Button icon={<ChevronLeft24Regular />} aria-label="Previous page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} />
            <Text role="status">
              {filtered.length === 0 ? 'No Sensor matches the filter' : `Showing ${firstShown}–${lastShown} of ${filtered.length} Sensors`}
              {filter !== '' && ` (filtered from ${sensorsQuery.data.length})`}
            </Text>
            <Button icon={<ChevronRight24Regular />} aria-label="Next page" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} />
          </div>
          <Button
            icon={refreshing ? <Spinner size="tiny" /> : <ArrowClockwise24Regular />}
            onClick={() => schedule.refreshSensors(rotationSensors.map((r) => r.id))}
            disabled={refreshDisabled || rotationSensors.length === 0}
          >
            {refreshing ? `Refreshing ${Math.min(refreshing.done + 1, refreshing.total)} / ${refreshing.total}…` : 'Refresh shown'}
          </Button>
        </div>
      )}
      {schedule.cooldownUntil ? (
        <RateLimitBanner cooldownUntil={schedule.cooldownUntil} />
      ) : (
        sensorsQuery.data &&
        sensorsQuery.data.length > 0 && (
          <Text size={200} className={styles.explanation}>
            Only the Sensors shown here are refreshed automatically - one request every {seconds} s, in turn
            {rotationSensors.length > 0 && `, so each one about every ${Math.max(seconds, rotationSensors.length * seconds)} s`}
            {schedule.lastTickAt && ` (last request ${formatRelative(schedule.lastTickAt)})`}. The circular arrow on a card refreshes just that Sensor now;
            "Refresh shown" refreshes all of them now, one after another.
          </Text>
        )
      )}

      {deviceQuery.isError && <ErrorState error={deviceQuery.error} />}
      {sensorsQuery.isLoading && <LoadingState label="Loading sensors…" />}
      {sensorsQuery.isError && <ErrorState error={sensorsQuery.error} onRetry={() => sensorsQuery.refetch()} />}
      {sensorsQuery.data && sensorsQuery.data.length === 0 && <EmptyState title="No sensors on this Device" />}

      {deviceQuery.data && sensorsQuery.data && sensorsQuery.data.length > 0 && (
        <div className={styles.grid}>
          {shown.map((sensor) => (
            <SensorLiveCard
              key={sensor.id}
              deviceId={selectedId!}
              sensor={sensor}
              applicationMode={deviceQuery.data.applicationMode as 'continuous' | 'periodic'}
              refreshing={schedule.manualSensorId === sensor.id}
              refreshDisabled={refreshDisabled}
              onRefresh={() => schedule.refreshSensors([sensor.id!])}
            />
          ))}
        </div>
      )}
    </>
  );
}
