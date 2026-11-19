import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Text,
  Body1Strong,
  Select,
  Checkbox,
  Input,
  RadioGroup,
  Radio,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Link24Regular, LinkDismiss24Regular, Search24Regular, Share24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { SensorDescriptionList } from '@/components/SensorDescription';
import { useSensorDescriptions } from '@/lib/useSensorDescriptions';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { DateTimeField } from '@/components/DateTimeField';
import { EnlargeableTelemetryChart } from '@/components/charts/EnlargeableTelemetryChart';
import { ReviewStatePill } from '@/components/StatusPill';
import { useDevices, useDevice } from '@/api/hooks/devices';
import { useSensors } from '@/api/hooks/sensors';
import { useAggregationPolicies } from '@/api/hooks/aggregationPolicies';
import { useTelemetryDateRange, familyFor } from '@/api/hooks/telemetry';
import { useKnowledgeCompatibility } from '@/api/hooks/knowledgeSharing';
import { useIssues } from '@/api/hooks/issues';
import { useNumberSearchParam } from '@/lib/useNumberSearchParam';
import { useDeviceSelection } from '@/lib/selectedDevice';
import { filterSensors } from '@/lib/sensorFilter';
import { splitShownSensors } from '@/lib/sensorVisibility';
import { findSameSensor } from '@/lib/sensorLink';
import { useDeviceAggregationPolicies } from '@/api/hooks/deviceConfiguration';
import { useAggregatedPoints } from '@/api/hooks/aggregatedPoints';
import { AggregationSelect } from '@/components/AggregationSelect';
import { levelOfSensorByKey, levelsOfSensors, type LevelPolicy } from '@/lib/aggregationLevels';
import { toApiIso, formatDateTime, parseApiDate } from '@/lib/dateTime';
import { useAuth } from '@/auth/AuthContext';
import { useBreakpoint } from '@/lib/useMediaQuery';
import { useT } from '@/lib/language';

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
    // A Device can have hundreds of Sensors: the list scrolls instead of pushing the chart far down the page.
    // 40% lower than before (260 px): with the chart above it, the list only needs to be a short, scrollable strip.
    maxHeight: '156px',
    overflowY: 'auto',
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

/** How far back Smart Analytics opens, and "Last 15 minutes" returns to. */
const DEFAULT_RANGE_MINUTES = 15;

/** The range Smart Analytics opens with, and "Last 15 minutes" returns to: the 15 minutes up to now. */
function lastFifteenMinutes() {
  const end = new Date();
  const start = new Date(end.getTime() - DEFAULT_RANGE_MINUTES * 60 * 1000);
  return { start, end };
}

/**
 * Most readings one chart series loads (read newest first, in pages): a day of a 5-second Sensor is about 17,300, so a whole day fits; a
 * longer range is cut off at its oldest end and the page says so. Keeps every read bounded.
 */
const MAX_CHART_POINTS = 20_000;

/** A notice when a series hit the cap: the range holds older readings than the chart shows. */
function TruncationNotice({ labels, lengths }: { labels: string[]; lengths: number[] }) {
  const t = useT();
  const cut = labels.filter((_, i) => (lengths[i] ?? 0) >= MAX_CHART_POINTS);
  if (cut.length === 0) return null;
  return (
    <MessageBar intent="info" style={{ marginBottom: tokens.spacingVerticalM }}>
      <MessageBarBody>
        <MessageBarTitle>{t('Newest')}{' '}{MAX_CHART_POINTS.toLocaleString('en-US')} {t('readings shown')}</MessageBarTitle>
        {t('The selected range holds more readings of')}{' '}{cut.join(', ')} {t('than one chart loads; the oldest ones are left out. Choose a shorter range to see them.')}</MessageBarBody>
    </MessageBar>
  );
}

/** A Sensor whose calculation is switched off (no analysis, no Issues, not part of the model) is listed grey, with a text marker (never colour alone). */
function calculationOffStyle(sensor: { processingEnabled?: boolean | null }): React.CSSProperties | undefined {
  return sensor.processingEnabled === false ? { color: tokens.colorNeutralForeground4, fontStyle: 'italic' } : undefined;
}
function calculationOffSuffix(sensor: { processingEnabled?: boolean | null }, t: (text: string) => string): string {
  return sensor.processingEnabled === false ? ` · ${t('Calculation off')}` : '';
}

/** Most Sensors one overlay chart draws (Multi Sensor mode); Single Sensor mode draws exactly one. */
const MAX_OVERLAY_SENSORS = 4;

/**
 * One Device's telemetry. "Single Sensor" (the default): exactly ONE Sensor of the Device is chosen (a radio list) and drawn with its full
 * reference set. "Multi Sensor": up to 4 Sensors are overlaid (a checkbox list, decision #16). The chosen Sensors are kept when switching
 * between the two (back in Single Sensor mode the first of them stays).
 */
function SensorAnalytics({
  deviceId,
  start,
  end,
  multi,
  levelKey,
  levelPolicies,
  onLevelKeyChange,
}: {
  deviceId: number;
  start: Date;
  end: Date;
  multi: boolean;
  /** The aggregation chosen in the toolbar ('' = the raw readings). */
  levelKey: string;
  levelPolicies: readonly LevelPolicy[] | undefined;
  onLevelKeyChange: (key: string) => void;
}) {
  const t = useT();
  const styles = useStyles();
  const breakpoint = useBreakpoint();
  const deviceQuery = useDevice(deviceId);
  const sensorsQuery = useSensors(deviceId);
  const [selectedSensorIds, setSelectedSensorIds] = useState<number[]>([]);
  const [sensorFilter, setSensorFilter] = useState('');
  // The large chart window stays open while the next / previous Sensor loads (Up / Down arrow).
  const [enlarged, setEnlarged] = useState(false);

  // A Sensor hidden with the Device page's "Visible" switch is not offered here (an Issue that involves it still shows it elsewhere).
  const { shown: sensors, hiddenCount } = useMemo(() => splitShownSensors(sensorsQuery.data), [sensorsQuery.data]);
  const visibleSensors = useMemo(() => filterSensors(sensors, sensorFilter), [sensors, sensorFilter]);
  const pickedIds = selectedSensorIds.filter((id) => sensors.some((s) => s.id === id));
  const effectiveSelection = (pickedIds.length > 0 ? pickedIds : sensors.slice(0, 1).map((s) => s.id!)).slice(0, multi ? MAX_OVERLAY_SENSORS : 1);
  const primarySensor = sensors.find((s) => s.id === effectiveSelection[0]);
  // The imported descriptions of the chosen Sensors (none imported = empty, and neither the side card nor the modal text appears).
  const describedSensors = effectiveSelection.map((id) => {
    const s = sensors.find((x) => x.id === id);
    return { deviceId, sensorId: id, sensorName: s?.externalSensorId, label: effectiveSelection.length > 1 ? s?.name || s?.externalSensorId : undefined };
  });
  const foundDescriptions = useSensorDescriptions(describedSensors);

  const policiesQuery = useAggregationPolicies(deviceId, primarySensor?.id);
  const issuesQuery = useIssues(deviceId, { includeMembers: false, take: 200 });

  // Rules of Hooks: call one telemetry query per potential sensor slot, up to
  // a small fixed cap, rather than calling useTelemetryDateRange inside a
  // .map() (which would violate conditional-hook-count rules as selection changes).
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
      maxPoints: MAX_CHART_POINTS,
      enabled: levelKey === '',
    });
  });
  // The aggregated buckets of the same Sensors for the chosen level (a Sensor without that level has none).
  const aggregatedQueries = slots.map((i) => {
    const sensorId = effectiveSelection[i];
    const level = levelKey === '' ? undefined : levelOfSensorByKey(levelPolicies, sensorId, levelKey);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAggregatedPoints({
      deviceId, sensorId, policyId: level?.policyId, range: { startDate: toApiIso(start), endDate: toApiIso(end) }, enabled: level !== undefined, refetchMs: 30_000,
    });
  });
  const aggregatedLevels = effectiveSelection.map((sensorId) => (levelKey === '' ? undefined : levelOfSensorByKey(levelPolicies, sensorId, levelKey)));

  if (sensorsQuery.isLoading || deviceQuery.isLoading) return <LoadingState label={t('Loading sensors…')} />;
  if (sensorsQuery.isError) return <ErrorState error={sensorsQuery.error} onRetry={() => sensorsQuery.refetch()} />;
  if (sensors.length === 0) {
    return hiddenCount > 0 ? (
      <EmptyState title={t('All Sensors of this Device are hidden')} description={t('An Admin can show them again with the Visible switch of each Sensor on the Device page.')} />
    ) : (
      <EmptyState title={t('This Device has no Sensors yet')} />
    );
  }

  const levelsAvailable = levelsOfSensors(levelPolicies, sensors.map((x) => x.id!));
  const stepSensor = (delta: -1 | 1) => {
    const ids = visibleSensors.map((x) => x.id!);
    const next = ids.indexOf(effectiveSelection[0] ?? -1) + delta;
    if (next >= 0 && next < ids.length) setSelectedSensorIds([ids[next]!]);
  };

  const series = effectiveSelection
    .map((sensorId, i) => {
      const sensor = sensors.find((s) => s.id === sensorId);
      const q = levelKey === '' ? queries[i] : aggregatedQueries[i];
      if (!sensor || !q) return null;
      const levelOfThis = aggregatedLevels[i];
      const name = sensor.name || sensor.externalSensorId || `Sensor ${sensorId}`;
      return {
        label: levelKey === '' ? name : `${name} · ${t(levelOfThis?.label ?? '')}`.replace(/ · $/, ''),
        points: q.data ?? [],
        bidirectional: levelKey === '' && sensor.direction === 'bidirectional',
        direction: sensor.direction,
        unitLabel: sensor.unitLabel,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const activeQueries = levelKey === '' ? queries : aggregatedQueries.filter((_, i) => aggregatedLevels[i] !== undefined && i < effectiveSelection.length);
  const anyLoading = activeQueries.some((q) => q.isLoading);
  const firstError = activeQueries.find((q) => q.isError);
  // Sensors of the selection that do not have the chosen level: nothing to draw for them.
  const withoutLevel = levelKey === '' ? [] : effectiveSelection.filter((_, i) => aggregatedLevels[i] === undefined).map((id) => sensors.find((x) => x.id === id)?.name || sensors.find((x) => x.id === id)?.externalSensorId || `Sensor ${id}`);

  const issuesInRange = (issuesQuery.data ?? []).filter((issue) => {
    const at = parseApiDate(issue.measuredAtTo ?? issue.measuredAtFrom);
    return at && at >= start && at <= end;
  });

  return (
    <div className={breakpoint === 'desktop' ? styles.layout : styles.layoutMobile}>
      <div>
        {/* The chart is on top, the Sensor list (the KPIs) below it. */}
        <Card className={styles.card}>
          {anyLoading && <LoadingState label={t('Loading telemetry…')} />}
          {firstError && <ErrorState error={firstError.error} />}
          {withoutLevel.length > 0 && (
            <MessageBar intent="info" style={{ marginBottom: tokens.spacingVerticalM }}>
              <MessageBarBody>{t('No such aggregation level on')}{' '}{withoutLevel.join(', ')}.</MessageBarBody>
            </MessageBar>
          )}
          {levelKey === '' && !anyLoading && !firstError && (
            <TruncationNotice labels={series.map((s) => s.label)} lengths={series.map((s) => s.points.length)} />
          )}
          {((!anyLoading && !firstError) || enlarged) && (
            <EnlargeableTelemetryChart
              open={enlarged}
              onOpenChange={setEnlarged}
              // Up / Down: the previous / next Sensor of the list (one Sensor on the chart; in Multi Sensor mode with several chosen the arrows do nothing).
              onStep={effectiveSelection.length === 1 ? stepSensor : undefined}
              // The aggregation can also be changed in the large window, at its top right.
              titleAction={levelsAvailable.length > 0 ? <AggregationSelect levels={levelsAvailable} value={levelKey} onChange={onLevelKeyChange} /> : undefined}
              title={series.map((s) => s.label).join(' · ') || t('Telemetry')}
              series={series}
              describedSensors={describedSensors}
              mode={series.length > 1 ? 'compare' : 'single'}
              showControlLimits={series.length === 1}
              // One Sensor: the platform's full reference set as the API stored it (Target, Tolerance, UCL3/UCL2/LCL2/LCL3 and their bands),
              // like the enlarged Live Monitoring chart. Several Sensors stay a clean overlay without limits.
              detailedLimits={series.length === 1 && levelKey === ''}
              height={360}
            />
          )}
        </Card>

        <Card className={styles.card} style={{ marginTop: tokens.spacingVerticalM }}>
          <Body1Strong>
            {multi ? t('Sensors ({0} of {1} shown, max {2})', effectiveSelection.length, Math.min(sensors.length, MAX_OVERLAY_SENSORS), MAX_OVERLAY_SENSORS) : t('Sensor (choose one)')}
          </Body1Strong>
          <Input
            aria-label={t('Filter Sensors')}
            placeholder={t('Filter Sensors by name…')}
            contentBefore={<Search24Regular />}
            value={sensorFilter}
            onChange={(_, d) => setSensorFilter(d.value)}
            style={{ marginTop: tokens.spacingVerticalS }}
          />
          <Text size={200} style={{ display: 'block', color: tokens.colorNeutralForeground3, margin: `${tokens.spacingVerticalXS} 0` }} role="status">
            {sensorFilter.trim() === '' ? t('{0} Sensors', sensors.length) : t('{0} of {1} Sensors match', visibleSensors.length, sensors.length)}
            {hiddenCount > 0 && t(' ({0} hidden on the Device page)', hiddenCount)}
            {t(' - selected: {0}', effectiveSelection.map((id) => sensors.find((s) => s.id === id)).map((s) => s?.name || s?.externalSensorId).join(', '))}
          </Text>
          <div className={styles.sensorList}>
            {visibleSensors.length === 0 && <Text size={200}>{t('No Sensor matches the filter.')}</Text>}
            {multi ? (
              visibleSensors.map((sensor) => (
                <Checkbox
                  key={sensor.id}
                  style={calculationOffStyle(sensor)}
                  label={`${sensor.name || sensor.externalSensorId} (${sensor.direction})${calculationOffSuffix(sensor, t)}`}
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
              ))
            ) : (
              // Single Sensor: exactly one is chosen; picking another replaces it.
              <RadioGroup aria-label={t('Sensor')} value={String(effectiveSelection[0] ?? '')} onChange={(_, d) => setSelectedSensorIds([Number(d.value)])}>
                {visibleSensors.map((sensor) => (
                  <Radio key={sensor.id} value={String(sensor.id)} style={calculationOffStyle(sensor)} label={`${sensor.name || sensor.externalSensorId} (${sensor.direction})${calculationOffSuffix(sensor, t)}`} />
                ))}
              </RadioGroup>
            )}
          </div>
        </Card>

        <Card className={styles.card} style={{ marginTop: tokens.spacingVerticalM }}>
          <Body1Strong>{t('Issues in range (')}{issuesInRange.length})</Body1Strong>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: tokens.spacingVerticalS }}>
            {t('Filtered locally over the currently loaded bounded Issue list for this Device - not a server-side search of all history.')}</Text>
          {issuesInRange.length === 0 && <Text size={200}>{t('No Issues in this range.')}</Text>}
          {issuesInRange.map((issue) => (
            <div key={issue.id} style={{ display: 'flex', justifyContent: 'space-between', padding: `${tokens.spacingVerticalXS} 0` }}>
              <Text size={200}>{formatDateTime(issue.measuredAtFrom)} → {formatDateTime(issue.measuredAtTo)}</Text>
              <ReviewStatePill reviewState={issue.reviewState} />
            </div>
          ))}
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0 }}>
      {foundDescriptions.length > 0 && (
        <Card className={styles.card}>
          <Body1Strong>{t('About')}{' '}{foundDescriptions.length > 1 ? t('these indicators') : t('this indicator')}</Body1Strong>
          <SensorDescriptionList found={foundDescriptions} />
        </Card>
      )}
      <Card className={styles.card}>
        <Body1Strong>{t('Aggregation policies')}</Body1Strong>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {t('For')}{' '}{primarySensor?.name || primarySensor?.externalSensorId} {t('- reference only, telemetry reads always return the Sensor\'s primary measured signal.')}</Text>
        {policiesQuery.isLoading && <LoadingState label="" />}
        {policiesQuery.data?.map((policy) => (
          <div key={policy.id} style={{ marginTop: tokens.spacingVerticalS }}>
            <Text weight="semibold" size={200}>
              {policy.sourceDataKey} · {policy.timeScale}
            </Text>
            <br />
            <Text size={200}>
              {t('Lookback')}{' '}{policy.lookback} {policy.scale} {t('· Min issue score')}{' '}{policy.minIssueScore}
            </Text>
          </div>
        ))}
      </Card>
      </div>
    </div>
  );
}

/** Two-Device comparison mode with compatibility-aware Sensor mapping (decision #17). */
function DeviceComparisonAnalytics({ deviceIdA, deviceIdB, start, end }: { deviceIdA: number; deviceIdB: number; start: Date; end: Date }) {
  const t = useT();
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
  const [filterA, setFilterA] = useState('');
  const [filterB, setFilterB] = useState('');
  // Linked (the default): choosing a Sensor on one side chooses the Sensor of the same name on the other side.
  const [linked, setLinked] = useState(true);

  // Hidden Sensors (Device page, "Visible" switch) are not offered; a chosen Sensor that has been hidden since falls back to the first shown one.
  const shownA = useMemo(() => splitShownSensors(sensorsA.data).shown, [sensorsA.data]);
  const shownB = useMemo(() => splitShownSensors(sensorsB.data).shown, [sensorsB.data]);
  const effectiveSensorA = sensorIdA !== undefined && shownA.some((s) => s.id === sensorIdA) ? sensorIdA : shownA[0]?.id;
  const effectiveSensorB = sensorIdB !== undefined && shownB.some((s) => s.id === sensorIdB) ? sensorIdB : shownB[0]?.id;

  // The same indicator on the other Device (same external id, else the same name). The link icon is light grey while there is none.
  const counterpartInB = findSameSensor(shownB, shownA.find((s) => s.id === effectiveSensorA));
  const counterpartInA = findSameSensor(shownA, shownB.find((s) => s.id === effectiveSensorB));
  const linkAvailable = counterpartInB !== undefined;
  const chooseA = (id: number) => {
    setSensorIdA(id);
    const other = linked ? findSameSensor(shownB, shownA.find((s) => s.id === id)) : undefined;
    if (other?.id != null) setSensorIdB(other.id);
  };
  const chooseB = (id: number) => {
    setSensorIdB(id);
    const other = linked ? findSameSensor(shownA, shownB.find((s) => s.id === id)) : undefined;
    if (other?.id != null) setSensorIdA(other.id);
  };
  const toggleLink = () => {
    const on = !linked;
    setLinked(on);
    // Linking again lines the right side up with the left one when it has the same indicator.
    if (on && counterpartInB?.id != null) setSensorIdB(counterpartInB.id);
  };

  // The chosen Sensor stays in its list even when it does not match the filter, so the select never shows a value that is not an option.
  const optionsFor = (sensors: typeof sensorsA.data, filter: string, chosen: number | undefined) => {
    const all = sensors ?? [];
    const matching = filterSensors(all, filter);
    const pinned = all.find((s) => s.id === chosen);
    return pinned && !matching.includes(pinned) ? [pinned, ...matching] : matching;
  };
  const optionsA = optionsFor(shownA, filterA, effectiveSensorA);
  const optionsB = optionsFor(shownB, filterB, effectiveSensorB);

  const familyA = familyFor((deviceA.data?.applicationMode as 'continuous' | 'periodic') ?? 'continuous', sensorsA.data?.find((s) => s.id === effectiveSensorA)?.direction);
  const familyB = familyFor((deviceB.data?.applicationMode as 'continuous' | 'periodic') ?? 'continuous', sensorsB.data?.find((s) => s.id === effectiveSensorB)?.direction);

  const dataA = useTelemetryDateRange({ family: familyA, deviceId: deviceIdA, sensorId: effectiveSensorA, startDate: toApiIso(start), endDate: toApiIso(end), maxPoints: MAX_CHART_POINTS });
  const dataB = useTelemetryDateRange({ family: familyB, deviceId: deviceIdB, sensorId: effectiveSensorB, startDate: toApiIso(start), endDate: toApiIso(end), maxPoints: MAX_CHART_POINTS });

  const stream = compatibility.data?.streams?.find(
    (s) => s.sourceSensorId === effectiveSensorA || s.targetSensorId === effectiveSensorB,
  );
  const provenCompatible = compatibility.data?.fullyCompatible || stream?.compatible;

  // The two chosen Sensors ALWAYS share one chart, whether or not the API could prove them compatible: you picked the pair, and a
  // comparison is only useful when both lines are on the same axes. Compatibility is a notice, not a gate - and nothing is ever
  // converted: when the units differ the values are drawn as they are, and the notice below says so.
  const sensorA = sensorsA.data?.find((s) => s.id === effectiveSensorA);
  const sensorB = sensorsB.data?.find((s) => s.id === effectiveSensorB);
  const labelA = `${deviceA.data?.deviceName ?? 'Device A'} · ${sensorA?.name || sensorA?.externalSensorId || 'Sensor'}`;
  const labelB = `${deviceB.data?.deviceName ?? 'Device B'} · ${sensorB?.name || sensorB?.externalSensorId || 'Sensor'}`;
  const unitsDiffer = !!(sensorA?.unitCode && sensorB?.unitCode && sensorA.unitCode !== sensorB.unitCode);
  const describedPair = [
    { deviceId: deviceIdA, sensorId: sensorA?.id, sensorName: sensorA?.externalSensorId, label: labelA },
    { deviceId: deviceIdB, sensorId: sensorB?.id, sensorName: sensorB?.externalSensorId, label: labelB },
  ];
  const foundPair = useSensorDescriptions(describedPair);

  if (sensorsA.isLoading || sensorsB.isLoading || compatibility.isLoading) return <LoadingState label={t('Checking compatibility…')} />;

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.column}>
          <Text size={200}>{t('Device A Sensor')}</Text>
          <Input aria-label={t('Filter Device A Sensors')} placeholder={t('Filter Sensors by name…')} contentBefore={<Search24Regular />} value={filterA} onChange={(_, d) => setFilterA(d.value)} />
          <Select aria-label={t('Device A Sensor')} value={effectiveSensorA !== undefined ? String(effectiveSensorA) : ''} onChange={(_, d) => chooseA(Number(d.value))}>
            {optionsA.map((s) => (
              <option key={s.id} value={s.id} style={calculationOffStyle(s)}>
                {s.name || s.externalSensorId}{calculationOffSuffix(s, t)}
              </option>
            ))}
          </Select>
        </div>
        <div className={styles.column}>
          <Button
            appearance="subtle"
            aria-label={linked ? t('Unlink the two Sensor lists') : t('Link the two Sensor lists (same indicator on both Devices)')}
            aria-pressed={linked}
            title={
              !linkAvailable && !counterpartInA
                ? t('The other Device has no Sensor with this name, so there is nothing to link')
                : linked
                  ? t('Linked: choosing a Sensor on one side chooses the one with the same name on the other side. Click to unlink.')
                  : t('Not linked. Click to link: choosing a Sensor on one side chooses the one with the same name on the other side.')
            }
            icon={linked ? <Link24Regular /> : <LinkDismiss24Regular />}
            onClick={toggleLink}
            data-link-available={linkAvailable || counterpartInA ? 'true' : 'false'}
            style={{ color: !linkAvailable && !counterpartInA ? tokens.colorNeutralForeground4 : linked ? tokens.colorBrandForeground1 : tokens.colorNeutralForeground2 }}
          />
        </div>
        <div className={styles.column}>
          <Text size={200}>{t('Device B Sensor')}</Text>
          <Input aria-label={t('Filter Device B Sensors')} placeholder={t('Filter Sensors by name…')} contentBefore={<Search24Regular />} value={filterB} onChange={(_, d) => setFilterB(d.value)} />
          <Select aria-label={t('Device B Sensor')} value={effectiveSensorB !== undefined ? String(effectiveSensorB) : ''} onChange={(_, d) => chooseB(Number(d.value))}>
            {optionsB.map((s) => (
              <option key={s.id} value={s.id} style={calculationOffStyle(s)}>
                {s.name || s.externalSensorId}{calculationOffSuffix(s, t)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!provenCompatible && (
        <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>
            <MessageBarTitle>{t('Not proven compatible')}</MessageBarTitle>
            {stream?.failures?.join(' ') ??
              t('These Sensors have not been proven compatible (matching SensorType, convertible units, and matching aggregation configuration).')}{' '}
            {t('They are drawn in one chart as you selected them; the values are not converted or aligned.')}</MessageBarBody>
        </MessageBar>
      )}
      {unitsDiffer && (
        <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>
            <MessageBarTitle>{t('Different units')}</MessageBarTitle>
            {labelA} {t('is in')}{' '}{sensorA?.unitLabel ?? sensorA?.unitCode}, {labelB} {t('in')}{' '}{sensorB?.unitLabel ?? sensorB?.unitCode}{t('. Both lines share one axis without conversion, so compare their shape, not their values.')}</MessageBarBody>
        </MessageBar>
      )}

      {(dataA.isLoading || dataB.isLoading) && <LoadingState label={t('Loading telemetry…')} />}
      {dataA.isError && <ErrorState error={dataA.error} />}
      {dataB.isError && <ErrorState error={dataB.error} />}
      {!dataA.isLoading && !dataB.isLoading && !dataA.isError && !dataB.isError && (
        <>
          <TruncationNotice labels={[labelA, labelB]} lengths={[dataA.data?.length ?? 0, dataB.data?.length ?? 0]} />
          <Card className={styles.card}>
            <EnlargeableTelemetryChart
              title={t('{0} and {1}', labelA, labelB)}
              describedSensors={describedPair}
              series={[
                { label: labelA, points: dataA.data ?? [], bidirectional: sensorA?.direction === 'bidirectional', direction: sensorA?.direction, unitLabel: sensorA?.unitLabel },
                { label: labelB, points: dataB.data ?? [], bidirectional: sensorB?.direction === 'bidirectional', direction: sensorB?.direction, unitLabel: sensorB?.unitLabel },
              ]}
              mode="compare"
              averageLine
              showControlLimits
              showSetpoint
              height={380}
            />
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {t('The dashed horizontal line of each Sensor is the average of the plotted readings. UCL3 / LCL3 are the control limits the platform calculated for that Sensor; Target and Tolerance are the Sensor\'s setpoint (the tolerance is the target compensated by the tolerance, on the side where a deviation is bad). Each line is drawn in its Sensor\'s colour and appears only where the platform has the value.')}</Text>
          </Card>
          {foundPair.length > 0 && (
            <Card className={styles.card} style={{ marginTop: tokens.spacingVerticalM }}>
              <Body1Strong>{t('About')}{' '}{foundPair.length > 1 ? t('these indicators') : t('this indicator')}</Body1Strong>
              <SensorDescriptionList found={foundPair} />
            </Card>
          )}
        </>
      )}

      {isAdmin && (
        <div style={{ marginTop: tokens.spacingVerticalM }}>
          <Button icon={<Share24Regular />} onClick={() => navigate(`/knowledge-sharing?sourceDeviceId=${deviceIdA}&targetDeviceId=${deviceIdB}`)}>
            {t('Start knowledge sharing between these Devices')}</Button>
          <Text size={200} style={{ display: 'block', color: tokens.colorNeutralForeground3, marginTop: tokens.spacingVerticalXXS }}>
            {t('This comparison view only visualizes data - it does not itself approve sharing, remap Sensors, or affect training.')}</Text>
        </div>
      )}
    </div>
  );
}

/** Single Sensor (the default), Multi Sensor (up to 4 overlaid) or two Devices side by side. */
type AnalyticsMode = 'sensor' | 'multi' | 'compare';

export function SmartAnalyticsPage() {
  const t = useT();
  const styles = useStyles();
  const [mode, setMode] = useState<AnalyticsMode>('sensor');
  const [deviceIdB, setDeviceIdB] = useNumberSearchParam('compareDeviceId');
  const [range, setRange] = useState(lastFifteenMinutes);

  const devicesQuery = useDevices();
  const devices = devicesQuery.data ?? [];
  // The aggregation chosen for the analysis ('' = the raw readings), picked right after the Device when it has any.
  const [levelKey, setLevelKey] = useState('');

  // Device A is the Device chosen on any page (it stays chosen while moving between menu items).
  const [effectiveA, setDeviceIdA] = useDeviceSelection(devicesQuery.data);
  const levelPoliciesQuery = useDeviceAggregationPolicies(effectiveA, mode !== 'compare');
  const levelSensorsQuery = useSensors(effectiveA);
  const toolbarLevels = useMemo(
    () => levelsOfSensors(levelPoliciesQuery.data, splitShownSensors(levelSensorsQuery.data).shown.map((x) => x.id!)),
    [levelPoliciesQuery.data, levelSensorsQuery.data],
  );
  // A level the (new) Device does not have falls back to the raw readings.
  const effectiveLevelKey = toolbarLevels.some((l) => l.key === levelKey) ? levelKey : '';

  const validationMessage = range.start >= range.end ? 'Start must be before end.' : undefined;

  if (devicesQuery.isLoading) return <LoadingState label={t('Loading devices…')} />;
  if (devicesQuery.isError) return <ErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />;

  return (
    <>
      <PageHeader
        title={t('Smart Analytics')}
        description={t('Historical exploration of one Sensor, multi-Sensor comparison, and two-Device comparison.')}
      />

      <div className={styles.toolbar}>
        <RadioGroup aria-label={t('Mode')} value={mode} onChange={(_, d) => setMode(d.value as AnalyticsMode)} layout="horizontal">
          <Radio value="sensor" label={t('Single Sensor')} />
          <Radio value="multi" label={t('Multi Sensor')} />
          <Radio value="compare" label={t('Compare Devices')} />
        </RadioGroup>

        <div className={styles.column}>
          <Text size={200}>{mode === 'compare' ? t('Device A') : t('Device')}</Text>
          <Select aria-label={mode === 'compare' ? t('Device A') : t('Device')} value={effectiveA !== undefined ? String(effectiveA) : ''} onChange={(_, d) => setDeviceIdA(Number(d.value))}>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.deviceName || d.externalDeviceId}
              </option>
            ))}
          </Select>
        </div>

        {mode !== 'compare' && toolbarLevels.length > 0 && (
          <div className={styles.column}>
            <Text size={200}>{t('Aggregation')}</Text>
            <AggregationSelect levels={toolbarLevels} value={effectiveLevelKey} onChange={setLevelKey} />
          </div>
        )}

        {mode === 'compare' && (
          <div className={styles.column}>
            <Text size={200}>{t('Device B')}</Text>
            <Select aria-label={t('Device B')} value={deviceIdB !== undefined ? String(deviceIdB) : ''} onChange={(_, d) => setDeviceIdB(Number(d.value))}>
              <option value="">{t('Select…')}</option>
              {devices.filter((d) => d.id !== effectiveA).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.deviceName || d.externalDeviceId}
                </option>
              ))}
            </Select>
          </div>
        )}

        <Button onClick={() => setRange(lastFifteenMinutes())}>{t('Last 15 minutes')}</Button>
        <DateTimeField label={t('Start')} value={range.start} onChange={(d) => d && setRange((r) => ({ ...r, start: d }))} maxDate={range.end} />
        <DateTimeField label={t('End')} value={range.end} onChange={(d) => d && setRange((r) => ({ ...r, end: d }))} minDate={range.start} validationMessage={validationMessage} />
      </div>

      {validationMessage && (
        <MessageBar intent="error" style={{ marginBottom: tokens.spacingVerticalM }}>
          <MessageBarBody>{validationMessage}</MessageBarBody>
        </MessageBar>
      )}

      {effectiveA !== undefined && !validationMessage && mode !== 'compare' && (
        <SensorAnalytics deviceId={effectiveA} start={range.start} end={range.end} multi={mode === 'multi'} levelKey={effectiveLevelKey} levelPolicies={levelPoliciesQuery.data} onLevelKeyChange={setLevelKey} />
      )}

      {effectiveA !== undefined && deviceIdB !== undefined && !validationMessage && mode === 'compare' && (
        <DeviceComparisonAnalytics deviceIdA={effectiveA} deviceIdB={deviceIdB} start={range.start} end={range.end} />
      )}

      {mode === 'compare' && deviceIdB === undefined && <EmptyState title={t('Select a second Device to compare')} />}
    </>
  );
}
