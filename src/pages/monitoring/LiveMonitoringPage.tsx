import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
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
import { ChartWithDescription } from '@/components/SensorDescription';
import { useSensorDescriptions } from '@/lib/useSensorDescriptions';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { FreshnessPill, MaintenancePill, ProcessingOffPill } from '@/components/StatusPill';
import { TelemetryChart } from '@/components/charts/TelemetryChart';
import { useDevices, useDevice } from '@/api/hooks/devices';
import { useSensors } from '@/api/hooks/sensors';
import { useDeviceAggregationPolicies } from '@/api/hooks/deviceConfiguration';
import { useAggregatedPoints } from '@/api/hooks/aggregatedPoints';
import { useRecentLevelAnomalies } from '@/api/hooks/recentAnomalies';
import { AggregationSelect } from '@/components/AggregationSelect';
import { levelsOfSensor, pickLevel, type LevelPreference } from '@/lib/aggregationLevels';
import { useTelemetryTrailingPeriods, useTelemetryTrailingWithLimits, familyFor, isCurveFamily, type TelemetryPoint } from '@/api/hooks/telemetry';
import { useDeviceSelection } from '@/lib/selectedDevice';
import { filterSensors } from '@/lib/sensorFilter';
import { splitShownSensors } from '@/lib/sensorVisibility';
import { usePageVisible } from '@/lib/usePageVisible';
import { formatRelative, formatDateTime, freshnessOf } from '@/lib/dateTime';
import { POLL_INTERVALS_MS } from '@/lib/pollIntervals';
import { useLiveMonitoringSchedule, type LiveSensor } from './useLiveMonitoringSchedule';
import type { SensorDto } from '@/api/hooks/sensors';
import { useT } from '@/lib/language';
import { useMaintenanceHistory } from '@/api/hooks/maintenance';
import { maintenanceMarkers } from '@/lib/maintenanceMarkers';
import { useArrowStep } from '@/lib/useArrowStep';

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
    position: 'relative',
  },
  calculationOff: {
    position: 'absolute',
    right: tokens.spacingHorizontalXS,
    bottom: tokens.spacingVerticalXS,
    pointerEvents: 'none',
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

const ENLARGED_CHART_HEIGHT = 'calc(85vh - 230px)';

function SensorLiveCard({
  deviceId,
  sensor,
  applicationMode,
  refreshing,
  refreshDisabled,
  onRefresh,
  enlarged,
  onEnlargedChange,
  onStep,
  levelPreference,
  onLevelPreferenceChange,
  showCalculatedLevel,
  autoRefresh,
  highlightAnomalies,
  anomalousPolicyIds,
}: {
  deviceId: number;
  sensor: SensorDto;
  applicationMode: 'continuous' | 'periodic';
  /** This Sensor's manual refresh is in flight. */
  refreshing: boolean;
  /** Another Live Monitoring request is in flight, or the API asked us to slow down. */
  refreshDisabled: boolean;
  onRefresh: () => void;
  /** The page owns which Sensor's chart is open, so the arrow keys can move to the previous / next Sensor. */
  enlarged: boolean;
  onEnlargedChange: (open: boolean) => void;
  /** -1 = the previous Sensor of the page, +1 = the next one. */
  onStep: (delta: -1 | 1) => void;
  /**
   * The aggregation chosen in the large window: a level, 'raw' (the raw readings), or undefined (nothing chosen: what the card shows). Kept by the page so it
   * stays while the arrow keys move between Sensors - a Sensor without that very level gets the closest one.
   */
  levelPreference: LevelPreference | 'raw' | undefined;
  onLevelPreferenceChange: (preference: LevelPreference | 'raw') => void;
  /** "Show calculated level": a Sensor whose raw values are not calculated shows its first (shortest) calculated aggregation level instead. */
  showCalculatedLevel: boolean;
  /** The page is refreshing (not paused, tab visible): the aggregated card chart is re-read too. */
  autoRefresh: boolean;
  /** "Highlight anomalies": a Sensor with an anomaly among the card's values shows the FIRST level that has one (the raw readings first). */
  highlightAnomalies: boolean;
  /** The aggregation levels (policy ids) that have an anomaly among their newest values; undefined while unknown or not asked. */
  anomalousPolicyIds: ReadonlySet<number> | undefined;
}) {
  const t = useT();
  const styles = useStyles();
  const family = familyFor(applicationMode, sensor.direction);
  const curveFamily = isCurveFamily(family);

  // Passive subscription only - see telemetry.ts's doc comment. This card
  // never triggers its own fetch; it just reads whatever the page-level
  // useLiveMonitoringSchedule orchestrator last wrote for this Sensor's key.
  const trailing = useTelemetryTrailingPeriods({ family, deviceId, sensorId: sensor.id, periods: 20 });

  const latest = trailing.data?.[trailing.data.length - 1];
  const neverFetched = trailing.data === undefined;
  const setEnlarged = onEnlargedChange;
  useArrowStep(enlarged, onStep); // Up / Down: the previous / next Sensor of the page
  const [showInfo, setShowInfo] = useState(false);
  // The aggregation levels this Sensor has: needed while the large window is open, and on the card when its raw values are not calculated and "Show
  // calculated level" is on (one request per Device, shared by every card). A level the Sensor lacks falls back to the raw readings.
  const rawOff = sensor.processingEnabled === false;
  const wantsCalculatedLevel = showCalculatedLevel && rawOff && !curveFamily;
  // An anomaly among the card's raw readings (the newest 20 the card holds).
  const rawAnomaly = highlightAnomalies && (trailing.data ?? []).some((point) => (point.anomaly ?? 0) > 0 || (point.anomalyAbove ?? 0) > 0 || (point.anomalyBelow ?? 0) > 0);
  const policies = useDeviceAggregationPolicies(deviceId, (enlarged && !curveFamily) || wantsCalculatedLevel || (highlightAnomalies && !curveFamily));
  const levels = levelsOfSensor(policies.data, sensor.id);
  // "Highlight anomalies": the first level with an anomaly - the raw readings, else the shortest aggregation level that has one.
  const anomalyLevel = highlightAnomalies && !rawAnomaly ? levels.find((l) => anomalousPolicyIds?.has(l.policyId)) : undefined;
  const hasAnomaly = rawAnomaly || anomalyLevel !== undefined;
  // What the card shows: the anomalous level; without an anomaly the raw readings - or, for a Sensor whose raw values are not calculated ("Show
  // calculated level"), the FIRST level that is calculated (shortest bucket first).
  const cardLevel = rawAnomaly ? undefined : (anomalyLevel ?? (wantsCalculatedLevel ? levels.find((l) => l.calculationEnabled) : undefined));
  const level = levelPreference === 'raw' ? undefined : levelPreference ? pickLevel(levels, levelPreference) : cardLevel;
  const cardAggregated = useAggregatedPoints({
    deviceId, sensorId: sensor.id, policyId: cardLevel?.policyId, newest: cardLevel ? { count: 20, bucketMs: cardLevel.bucketMs } : undefined,
    enabled: cardLevel !== undefined, refetchMs: autoRefresh ? 30_000 : undefined,
  });
  // The control limits are not stored: the API calculates them when it reads, and the batched read the cards use leaves them out. The enlarged
  // chart therefore reads its own Sensor WITH the limits (every 5 s while the window is open, paused in a rate-limit cooldown).
  const limits = useTelemetryTrailingWithLimits({ family, deviceId, sensorId: sensor.id, periods: 20, enabled: enlarged && !curveFamily && level === undefined, paused: refreshDisabled });
  const aggregated = useAggregatedPoints({
    deviceId, sensorId: sensor.id, policyId: level?.policyId, newest: level ? { count: 100, bucketMs: level.bucketMs } : undefined,
    enabled: enlarged && level !== undefined, refetchMs: 15_000,
  });
  // Read from the API only while the enlarged chart is open (a page of 50 cards must not make 50 requests).
  const description = useSensorDescriptions([{ deviceId, sensorId: sensor.id, sensorName: sensor.externalSensorId }], enlarged);
  // The Sensor's maintenances on the enlarged chart (read only while it is open; one request per Device, shared by every card).
  const maintenanceQuery = useMaintenanceHistory(enlarged ? deviceId : undefined);
  const markers = useMemo(
    () => (enlarged ? maintenanceMarkers(maintenanceQuery.data?.items, sensor.id === undefined ? [] : [sensor.id], level?.policyId) : []),
    [enlarged, maintenanceQuery.data, sensor.id, level?.policyId],
  );
  const sensorLabel = sensor.name || sensor.externalSensorId || 'Sensor';
  // One definition for the card and the enlarged view, so the modal always shows exactly the data the card has (it moves with every refresh).
  // The enlarged chart draws every Target / Tolerance / UCL / LCL line the API has a value for (never computed here); a line it has none for is simply absent.
  const seriesOf = (points: TelemetryPoint[]) => [{ label: sensorLabel, points, bidirectional: sensor.direction === 'bidirectional', direction: sensor.direction, unitLabel: sensor.unitLabel }];
  const levelSeries = (name: string, points: TelemetryPoint[]) => [{ label: name, points, bidirectional: false, direction: sensor.direction, unitLabel: sensor.unitLabel }];
  const chartSeries = cardLevel ? levelSeries(`${sensorLabel} · ${t(cardLevel.label)}`, cardAggregated.data ?? []) : seriesOf(trailing.data ?? []);
  const cardLatest = cardLevel ? cardAggregated.data?.[cardAggregated.data.length - 1] : latest;
  // The enlarged chart's own read carries the calculated control limits; until it has answered, the card's data (without them) is shown.
  const enlargedSeries = level
    ? levelSeries(`${sensorLabel} · ${t(level.label)}`, aggregated.data ?? [])
    : seriesOf(limits.data ?? trailing.data ?? []);
  // The big number of the window: the newest aggregated bucket (its start) while an aggregation is shown, otherwise the latest reading.
  const shownLatest = level ? aggregated.data?.[aggregated.data.length - 1] : latest;

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
              aria-label={t('Enlarge chart of {0}', sensorLabel)}
              title={t('Open the chart in a large window')}
              onClick={() => setEnlarged(true)}
            />
          )}
          {!curveFamily && (
            <Button
              appearance="subtle"
              size="small"
              icon={refreshing ? <Spinner size="extra-tiny" /> : <ArrowClockwise16Regular />}
              aria-label={t('Refresh {0}', sensor.name || sensor.externalSensorId)}
              title={t('Refresh this Sensor now')}
              disabled={refreshDisabled || refreshing}
              onClick={onRefresh}
            />
          )}
        </div>
      </div>

      {curveFamily ? (
        <EmptyState
          title={t('Not applicable to Periodic Sensors')}
          description={t('Curve runs aren\'t a regular clock tick - use Smart Analytics to inspect the most recent curve period for this Sensor.')}
        />
      ) : trailing.isError ? (
        <ErrorState error={trailing.error} />
      ) : neverFetched ? (
        // Real, honest state - the first refresh of the Sensors on screen has not come back yet (the schedule makes one batched request
        // for all of them, see CLAUDE.md's "Live Monitoring" section), so there is nothing to show rather than a faked "live" value.
        // trailing.isFetching is true while that request is on its way.
        <LoadingState label={trailing.isFetching ? t('Refreshing…') : t('Waiting for first refresh…')} />
      ) : (
        <>
          <div className={styles.valueRow}>
            <span className={styles.bigValue}>{cardLatest?.actual ?? '—'}</span>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {cardLatest ? `${cardLevel ? `${t('bucket from')} ` : ''}${formatRelative(cardLatest.measured)}` : t('no data')}
            </Text>
          </div>
          {/* Clicking the chart opens it large (mouse convenience); the keyboard and screen-reader route is the "Enlarge" button above. */}
          <div className={styles.chartArea} onClick={() => setEnlarged(true)}>
            <TelemetryChart series={chartSeries} height={160} mode="single" timeAxis="time" compact />
            {/* Bottom right corner: the aggregation level shown instead of the raw readings, or - when nothing of the Sensor is calculated, or the
                calculated level is not asked for - that the calculation of what is shown is off. */}
            {hasAnomaly ? (
              <div className={styles.calculationOff}>
                <Badge appearance="filled" color="danger">{t('Anomaly: {0}', cardLevel ? t(cardLevel.label) : t('Raw readings'))}</Badge>
              </div>
            ) : cardLevel ? (
              <div className={styles.calculationOff}>
                <Badge appearance="tint" color="brand">{t(cardLevel.label)}</Badge>
              </div>
            ) : (
              rawOff && (
                <div className={styles.calculationOff}>
                  <ProcessingOffPill processingEnabled={false} label="Calculation off" />
                </div>
              )
            )}
          </div>
        </>
      )}
      <Dialog open={enlarged} onOpenChange={(_, d) => setEnlarged(d.open)}>
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody>
            <DialogTitle
              action={
                <div className={styles.headerActions}>
                  {/* Raw readings or one of the aggregation levels the Sensor has - only shown when there is a level. */}
                  {levels.length > 0 && <AggregationSelect levels={levels} value={level?.key ?? ''} onChange={(key) => onLevelPreferenceChange(levels.find((l) => l.key === key) ?? 'raw')} rawCalculationOff={rawOff} />}
                  {/* The same one-off refresh as the card's icon, so the enlarged chart can be refreshed without closing it. */}
                  <Button
                    appearance="subtle"
                    icon={refreshing ? <Spinner size="tiny" /> : <ArrowClockwise16Regular />}
                    aria-label={t('Refresh {0}', sensorLabel)}
                    title={t('Refresh this Sensor now')}
                    disabled={refreshDisabled || refreshing}
                    onClick={() => {
                      onRefresh();
                      void limits.refetch();
                    }}
                  />
                  <DialogTrigger disableButtonEnhancement action="close">
                    <Button appearance="subtle" aria-label={t('Close')} icon={<Dismiss24Regular />} />
                  </DialogTrigger>
                </div>
              }
            >
              {sensorLabel}
            </DialogTitle>
            <DialogContent>
              <div className={styles.valueRow}>
                <span className={styles.bigValue}>{shownLatest?.actual ?? '—'}</span>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {shownLatest ? `${level ? `${t('bucket from')} ` : ''}${formatDateTime(shownLatest.measured)} (${formatRelative(shownLatest.measured)})` : t('no data')}
                </Text>
              </div>
              {/* The imported description opens beside the chart with the blue "<" edge tab; no description = no tab. */}
              <ChartWithDescription found={description} open={showInfo} onToggle={() => setShowInfo(!showInfo)} height={ENLARGED_CHART_HEIGHT}>
                <TelemetryChart series={enlargedSeries} height={ENLARGED_CHART_HEIGHT} mode="single" detailedLimits timeAxis="fullDateTime" emphasizeHover plainTooltip maintenances={markers} />
              </ChartWithDescription>
            </DialogContent>
            <DialogActions>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginRight: 'auto' }}>
                {t('Up / Down arrow: previous / next Sensor')}</Text>
              <Button appearance="primary" onClick={() => setEnlarged(false)}>
                {t('Close')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </Card>
  );
}

function RateLimitBanner({ cooldownUntil }: { cooldownUntil: Date }) {
  const t = useT();
  return (
    <MessageBar intent="warning" role="status">
      <MessageBarBody>
        <MessageBarTitle>{t('Too many requests')}</MessageBarTitle>
        {t('Live Monitoring is pausing its refresh cycle - the API asked every client on this network to slow down. Existing readings stay visible. Retrying automatically around')}{' '}{formatDateTime(cooldownUntil)}.
      </MessageBarBody>
    </MessageBar>
  );
}

const PAGE_SIZES = [10, 25, 50] as const;

/** Lags the value behind by delayMs, so typing in the filter does not restart the refresh on every keystroke. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

export function LiveMonitoringPage() {
  const t = useT();
  const styles = useStyles();
  const navigate = useNavigate();
  const pageVisible = usePageVisible();
  const [live, setLive] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);
  // The Sensor whose chart is open in the large window (the arrow keys step through the Sensors of the page).
  const [enlargedId, setEnlargedId] = useState<number | null>(null);
  // The aggregation chosen in the large window (undefined = nothing chosen: what the card shows); it stays while the arrow keys move to the next Sensor.
  const [levelPreference, setLevelPreference] = useState<LevelPreference | 'raw' | undefined>(undefined);
  // On by default: a Sensor whose raw values are not calculated shows its first calculated aggregation level.
  const [showCalculatedLevel, setShowCalculatedLevel] = useState(true);
  // Off by default.
  const [highlightAnomalies, setHighlightAnomalies] = useState(false);
  const filter = useDebounced(filterText.trim().toLowerCase(), 500);

  const devicesQuery = useDevices();
  // The Device chosen on any page stays chosen while moving between menu items (see lib/selectedDevice.ts).
  const [selectedId, setDeviceId] = useDeviceSelection(devicesQuery.data);
  const deviceQuery = useDevice(selectedId);
  const sensorsQuery = useSensors(selectedId);

  const effectiveLive = live && pageVisible;

  const devices = devicesQuery.data ?? [];
  const applicationMode = deviceQuery.data?.applicationMode as 'continuous' | 'periodic' | undefined;

  // What the page shows is what it keeps fresh: a Device can have hundreds of Sensors, so only the Sensors on screen (after the filter,
  // one page of them) are refreshed - all together, in ONE request every few seconds. Narrow the filter or turn the page to watch others.
  // A Sensor hidden with the Device page's "Visible" switch is left out of the cards and the refresh (it still exists, and an Issue
  // that involves it still shows it).
  const { shown: shownSensors, hiddenCount } = useMemo(() => splitShownSensors(sensorsQuery.data), [sensorsQuery.data]);
  const filtered = useMemo(() => filterSensors(shownSensors, filter), [shownSensors, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const shown = useMemo(() => filtered.slice(safePage * pageSize, safePage * pageSize + pageSize), [filtered, safePage, pageSize]);

  // Only Sensors with a real trailing-periods concept belong in the refresh - a curve Sensor's card never fetches anything
  // (see SensorLiveCard), so including it would just waste a turn every sweep.
  const liveSensors = useMemo<LiveSensor[]>(() => {
    if (!applicationMode) return [];
    return shown
      .map((sensor) => ({ id: sensor.id!, family: familyFor(applicationMode, sensor.direction) }))
      .filter((s) => !isCurveFamily(s.family));
  }, [shown, applicationMode]);

  // Which levels of the Sensors on screen have an anomaly (one request for the page, only while the highlighting is on).
  const recentAnomalies = useRecentLevelAnomalies(selectedId, liveSensors.map((s) => s.id), highlightAnomalies, effectiveLive ? 30_000 : undefined);
  const anomalousPolicyIds = useMemo(() => (highlightAnomalies && recentAnomalies.data ? new Set(recentAnomalies.data.map((a) => a.policyId!)) : undefined), [highlightAnomalies, recentAnomalies.data]);

  const schedule = useLiveMonitoringSchedule({
    active: effectiveLive && selectedId !== undefined,
    deviceId: selectedId,
    sensors: liveSensors,
    periods: 20,
    intervalMs: POLL_INTERVALS_MS.liveMonitoringCycle,
  });

  useEffect(() => {
    setPage(0);
  }, [filter, pageSize, selectedId]);
  useEffect(() => {
    setEnlargedId(null);
  }, [selectedId]);

  // A curve Sensor has no chart to open, so the arrows step through the Sensors that do (in the order of the page).
  const stepEnlarged = (delta: -1 | 1) => {
    const ids = liveSensors.map((l) => l.id);
    const next = ids.indexOf(enlargedId ?? -1) + delta;
    if (next >= 0 && next < ids.length) setEnlargedId(ids[next]!);
  };

  if (devicesQuery.isLoading) return <LoadingState label={t('Loading devices…')} />;
  if (devicesQuery.isError) return <ErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />;

  const refreshDisabled = schedule.cooldownUntil !== null || schedule.manualSensorIds.length > 0;
  const refreshing = schedule.manualSensorIds.length > 0;
  const firstShown = filtered.length === 0 ? 0 : safePage * pageSize + 1;
  const lastShown = safePage * pageSize + shown.length;
  const seconds = POLL_INTERVALS_MS.liveMonitoringCycle / 1000;

  return (
    <>
      <PageHeader
        title={t('Live Monitoring')}
        description={t('Current operational state - latest readings, freshness, and active warnings. For historical exploration and comparison, use Smart Analytics.')}
        actions={
          selectedId !== undefined && (
            <>
              <Button
                icon={<DataTrending24Regular />}
                onClick={() => navigate(`/analytics?deviceId=${selectedId}`)}
              >
                {t('Open in Smart Analytics')}</Button>
            </>
          )
        }
      />

      <div className={styles.toolbar}>
        <Select aria-label={t('Device')} value={selectedId !== undefined ? String(selectedId) : ''} onChange={(_, d) => setDeviceId(Number(d.value))}>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.deviceName || d.externalDeviceId}
            </option>
          ))}
        </Select>
        <Input
          className={styles.search}
          type="search"
          aria-label={t('Filter Sensors')}
          placeholder={t('Filter Sensors by name…')}
          contentBefore={<Search24Regular />}
          value={filterText}
          onChange={(_, d) => setFilterText(d.value)}
        />
        <Select aria-label={t('Sensors per page')} value={String(pageSize)} onChange={(_, d) => setPageSize(Number(d.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} {t('per page')}</option>
          ))}
        </Select>
        <Switch checked={live} onChange={(_, d) => setLive(d.checked)} label={live ? t('Refresh every {0} seconds', seconds) : t('Paused')} />
        <Switch checked={showCalculatedLevel} onChange={(_, d) => setShowCalculatedLevel(d.checked)} label={t('Show calculated level')} />
        <Switch checked={highlightAnomalies} onChange={(_, d) => setHighlightAnomalies(d.checked)} label={t('Highlight anomalies')} />
        {!pageVisible && live && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {t('Paused - tab not visible')}</Text>
        )}
      </div>

      {sensorsQuery.data && shownSensors.length > 0 && (
        <div className={styles.statusBar}>
          <div className={styles.pager}>
            <Button icon={<ChevronLeft24Regular />} aria-label={t('Previous page')} disabled={safePage === 0} onClick={() => setPage(safePage - 1)} />
            <Text role="status">
              {filtered.length === 0 ? t('No Sensor matches the filter') : t('Showing {0}–{1} of {2} Sensors', firstShown, lastShown, filtered.length)}
              {filter !== '' && t(' (filtered from {0})', shownSensors.length)}
              {hiddenCount > 0 && t(' - {0} hidden Sensor(s) not listed (Visible switch on the Device page)', hiddenCount)}
            </Text>
            <Button icon={<ChevronRight24Regular />} aria-label={t('Next page')} disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} />
          </div>
          <Button
            icon={refreshing ? <Spinner size="tiny" /> : <ArrowClockwise24Regular />}
            onClick={() => schedule.refreshSensors(liveSensors.map((r) => r.id))}
            disabled={refreshDisabled || liveSensors.length === 0}
          >
            {refreshing ? t('Refreshing…') : t('Refresh shown')}
          </Button>
        </div>
      )}
      {schedule.cooldownUntil ? (
        <RateLimitBanner cooldownUntil={schedule.cooldownUntil} />
      ) : (
        sensorsQuery.data &&
        shownSensors.length > 0 && (
          <Text size={200} className={styles.explanation}>
            {t('Only the Sensors shown here are refreshed automatically - all of them together, in one request every')}{' '}{seconds} s
            {schedule.lastTickAt && t(' (last request {0})', formatRelative(schedule.lastTickAt))}{t('. The circular arrow on a card refreshes just that Sensor now; "Refresh shown" refreshes all of them now.')}</Text>
        )
      )}

      {deviceQuery.isError && <ErrorState error={deviceQuery.error} />}
      {sensorsQuery.isLoading && <LoadingState label={t('Loading sensors…')} />}
      {sensorsQuery.isError && <ErrorState error={sensorsQuery.error} onRetry={() => sensorsQuery.refetch()} />}
      {sensorsQuery.data && sensorsQuery.data.length === 0 && <EmptyState title={t('No sensors on this Device')} />}
      {sensorsQuery.data && sensorsQuery.data.length > 0 && shownSensors.length === 0 && (
        <EmptyState
          title={t('All Sensors of this Device are hidden')}
          description={t('An Admin can show them again with the Visible switch of each Sensor on the Device page.')}
        />
      )}

      {deviceQuery.data && sensorsQuery.data && shownSensors.length > 0 && (
        <div className={styles.grid}>
          {shown.map((sensor) => (
            <SensorLiveCard
              key={sensor.id}
              deviceId={selectedId!}
              sensor={sensor}
              applicationMode={deviceQuery.data.applicationMode as 'continuous' | 'periodic'}
              refreshing={schedule.manualSensorIds.includes(sensor.id!)}
              refreshDisabled={refreshDisabled}
              onRefresh={() => schedule.refreshSensors([sensor.id!])}
              enlarged={enlargedId === sensor.id}
              onEnlargedChange={(open) => setEnlargedId(open ? sensor.id! : enlargedId === sensor.id ? null : enlargedId)}
              onStep={stepEnlarged}
              levelPreference={levelPreference}
              onLevelPreferenceChange={(p) => setLevelPreference(p === 'raw' ? 'raw' : { key: p.key, bucketMs: p.bucketMs })}
              showCalculatedLevel={showCalculatedLevel}
              autoRefresh={effectiveLive}
              highlightAnomalies={highlightAnomalies}
              anomalousPolicyIds={anomalousPolicyIds}
            />
          ))}
        </div>
      )}
    </>
  );
}
