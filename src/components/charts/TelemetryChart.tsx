import { useEffect, useId, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import type { TelemetryPoint } from '@/api/hooks/telemetry';
import { seriesPalette, seriesDashPatterns, anomalyColors } from './palette';
import { formatDateTime, formatShortDateTime, formatTime } from '@/lib/dateTime';
import { seriesAverage } from '@/lib/seriesAverage';
import { plainLegendName, plainTooltipName } from './seriesNames';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    width: '100%',
    minWidth: 0,
  },
  canvasWrap: {
    position: 'relative',
    width: '100%',
    minWidth: 0,
  },
  summary: {
    color: tokens.colorNeutralForeground3,
  },
  // Visually hidden, still read by assistive technology (the chart's accessible description).
  summaryHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
});

export interface TelemetrySeriesInput {
  label: string;
  points: TelemetryPoint[];
  bidirectional?: boolean;
  /** The Sensor's direction ('lowerisbetter' | 'higherisbetter' | 'bidirectional'); decides on which side of the target the tolerance line is drawn. */
  direction?: string | null;
  /** Display label of the series' unit, exactly as the API returns it (`SensorDto.unitLabel`). Never derived from the metric name; omit when the Sensor has none. */
  unitLabel?: string | null;
}

export interface TelemetryChartProps {
  series: TelemetrySeriesInput[];
  /** Pixels, or any CSS length (e.g. `calc(85vh - 220px)`) for a chart that follows the window. */
  height?: number | string;
  /** 'single' shows control-limit bands, target/tolerance bands, and anomaly markers - built for one series. 'compare' shows clean overlay lines for legibility across several series (decision #17). */
  mode?: 'single' | 'compare';
  showControlLimits?: boolean;
  title?: string;
  emptyLabel?: string;
  /**
   * 'dateTime' (default): x-axis ticks show month-day and clock time. 'time': ticks show only HH:mm:ss - for a short live window
   * where every point is minutes apart at most; the tooltip then carries the full date and time of the point.
   * 'fullDateTime': ticks show yy-MM-dd HH:mm:ss (an enlarged chart).
   */
  timeAxis?: 'dateTime' | 'time' | 'fullDateTime';
  /**
   * A small, glanceable chart: no tooltip on hover, a legend that cannot be clicked to hide a series, and the text summary is
   * kept for assistive technology but not shown under the chart.
   */
  compact?: boolean;
  /** Hovering a point enlarges its marker five times, so it is clear which value the tooltip shows. */
  emphasizeHover?: boolean;
  /**
   * Draws each series' AVERAGE as a thin horizontal line in the series' colour (named `<series label> average`), and the text summary
   * states it. It is the plain arithmetic mean of exactly the points that are plotted (points without a value are not counted) - a
   * descriptive statistic of what is on screen, not a platform calculation; when a long range was cut off, it covers what was loaded.
   */
  averageLine?: boolean;
  /**
   * For a chart of ONE Sensor (the Live Monitoring modal): the hover tooltip lists only "Actual" and "Target" with their values
   * (and unit) - not the Sensor's name and not the control-limit lines, which stay drawn but are left out of the tooltip.
   */
  plainTooltip?: boolean;
  /**
   * For a chart of ONE Sensor in 'single' mode (the Live Monitoring modal), drawn like the platform's original Issue/real-time chart:
   * Target and Tolerance (the target compensated by the tolerance: target + tolerance when lower is better, target - tolerance when
   * higher is better; a bidirectional Sensor gets Target Above/Below and Tolerance Above/Below), the Actual line, and the server's
   * UCL3, UCL2, LCL2 and LCL3 with the two bands between UCL3-UCL2 and LCL2-LCL3 shaded. The legend names the lines plainly
   * ("Actual", "Target", "UCL3", ...) without the Sensor's name. Every value is the API's; only target +/- tolerance is added up here.
   */
  detailedLimits?: boolean;
  /** Called when the chart is clicked anywhere except on its legend (which keeps toggling series); the pointer shows a zoom cursor. */
  onEnlarge?: () => void;
}

/**
 * The one unit label shared by every series, or undefined when the series differ (then the unit is only shown per series
 * in the tooltip - two units must never be merged under one axis title).
 */
export function sharedUnitLabel(series: TelemetrySeriesInput[]): string | undefined {
  const labels = new Set(series.map((s) => s.unitLabel).filter((l): l is string => !!l));
  const everySeriesHasOne = series.every((s) => !!s.unitLabel);
  return labels.size === 1 && everySeriesHasOne ? [...labels][0] : undefined;
}

/** Greys of the platform's original chart: the 3-sigma limits darker, the 2-sigma limits lighter, the bands between them lightly shaded. */
const LIMIT_COLOR_3S = '#808080';
const LIMIT_COLOR_2S = '#B8B8B8';
const LIMIT_BAND = 'rgba(128, 128, 128, 0.12)';

/**
 * The datasets of a single Sensor's detailed chart, in the order of the platform's original chart (which is also the legend's order):
 * Target and Tolerance, the Actual line, then UCL3, UCL2, LCL2, LCL3. A band is filled to the neighbouring limit ('-1'), so a limit
 * is only paired with the one it sits next to; a line without a single value is left out (no empty legend entries).
 */
function detailedDatasets(
  s: TelemetrySeriesInput,
  aligned: (TelemetryPoint | null)[],
  actual: ChartData<'line'>['datasets'][number],
  emphasizeHover: boolean,
): ChartData<'line'>['datasets'] {
  const name = (suffix: string) => `${s.label} ${suffix}`;
  const plain = (suffix: string, data: (number | null)[], color: string, width: number, dash: number[], extra: object = {}) => ({
    label: name(suffix),
    data,
    borderColor: color,
    borderDash: dash,
    borderWidth: width,
    pointRadius: 0,
    ...(emphasizeHover ? { pointHoverRadius: 0 } : {}),
    ...extra,
  });
  const has = (values: (number | null)[]) => values.some((v) => v !== null);
  const sum = (a: number | null | undefined, b: number | null | undefined, sign: 1 | -1) => (a != null && b != null ? a + sign * b : null);
  const out: ChartData<'line'>['datasets'] = [];

  if (s.bidirectional) {
    // Both sides have their own target and tolerance: the tolerance lies beyond the target on its own side.
    const lines: [string, (number | null)[], string][] = [
      ['Target Above', aligned.map((p) => p?.targetAbove ?? null), '#6FB1E8'],
      ['Tolerance Above', aligned.map((p) => sum(p?.targetAbove, p?.toleranceAbove, 1)), '#0B3C78'],
      ['Target Below', aligned.map((p) => p?.targetBelow ?? null), anomalyColors.warning],
      ['Tolerance Below', aligned.map((p) => sum(p?.targetBelow, p?.toleranceBelow, -1)), anomalyColors.critical],
    ];
    for (const [suffix, values, color] of lines) if (has(values)) out.push(plain(suffix, values, color, 2.5, [5, 5]));
  } else {
    const target = aligned.map((p) => p?.target ?? null);
    if (has(target)) out.push(plain('Target', target, anomalyColors.warning, 3, [5, 5]));
    // The tolerance line is the target compensated by the tolerance, on the side where a deviation is bad. Without a known direction
    // it is not drawn rather than guessed.
    const sign = s.direction === 'lowerisbetter' ? 1 : s.direction === 'higherisbetter' ? -1 : null;
    const tolerance = sign === null ? [] : aligned.map((p) => sum(p?.target, p?.tolerance, sign));
    if (has(tolerance)) out.push(plain('Tolerance', tolerance, anomalyColors.critical, 3, [5, 5]));
  }

  out.push(actual);

  const ucl3 = aligned.map((p) => p?.upperControlLimit3S ?? null);
  const ucl2 = aligned.map((p) => p?.upperControlLimit2S ?? null);
  const lcl2 = aligned.map((p) => p?.lowerControlLimit2S ?? null);
  const lcl3 = aligned.map((p) => p?.lowerControlLimit3S ?? null);
  if (has(ucl3)) out.push(plain('UCL3', ucl3, LIMIT_COLOR_3S, 1.5, [30, 15]));
  if (has(ucl2)) out.push(plain('UCL2', ucl2, LIMIT_COLOR_2S, 1.5, [30, 15], has(ucl3) ? { fill: '-1', backgroundColor: LIMIT_BAND } : {}));
  if (has(lcl2)) out.push(plain('LCL2', lcl2, LIMIT_COLOR_2S, 1.5, [30, 15]));
  if (has(lcl3)) out.push(plain('LCL3', lcl3, LIMIT_COLOR_3S, 1.5, [30, 15], has(lcl2) ? { fill: '-1', backgroundColor: LIMIT_BAND } : {}));
  return out;
}

/** The unit label of the series a dataset belongs to; derived datasets (limits, target) are named `<series label> UCL3` etc. */
export function unitLabelOfDataset(series: TelemetrySeriesInput[], datasetLabel: string | undefined): string | undefined {
  if (!datasetLabel) return undefined;
  const owner = series.find((s) => datasetLabel === s.label) ?? series.find((s) => datasetLabel.startsWith(s.label + ' '));
  return owner?.unitLabel || undefined;
}

const POINT_RADIUS = 3;

/** True when a canvas position lies on the chart's legend, where a click toggles a series instead of enlarging the chart. */
function isInsideLegend(chart: ChartJS, x: number | null, y: number | null): boolean {
  const legend = chart.legend;
  if (!legend || x === null || y === null) return false;
  return x >= legend.left && x <= legend.right && y >= legend.top && y <= legend.bottom;
}

/** Above this many points a series is drawn as a plain line (markers only for anomalous points) and without animation. */
const MANY_POINTS = 1500;

function anomalyLevel(point: TelemetryPoint): number {
  return point.anomaly ?? Math.max(point.anomalyAbove ?? 0, point.anomalyBelow ?? 0);
}

function anomalyPointColor(point: TelemetryPoint, base: string): string {
  const level = anomalyLevel(point);
  if (level === 2) return anomalyColors.critical;
  if (level === 1) return anomalyColors.warning;
  return base;
}

function summarize(series: TelemetrySeriesInput[], averageLine: boolean): string {
  if (series.length === 0 || series.every((s) => s.points.length === 0)) return 'No data in range.';
  const parts = series.map((s) => {
    const points = s.points.filter((p) => p.actual != null);
    if (points.length === 0) return `${s.label}: no data`;
    const last = points[points.length - 1]!;
    const criticalCount = points.filter((p) => (p.anomaly ?? Math.max(p.anomalyAbove ?? 0, p.anomalyBelow ?? 0)) === 2).length;
    const warningCount = points.filter((p) => (p.anomaly ?? Math.max(p.anomalyAbove ?? 0, p.anomalyBelow ?? 0)) === 1).length;
    const anomalyPart = criticalCount || warningCount ? `, ${criticalCount} critical / ${warningCount} warning point(s)` : '';
    const average = averageLine ? seriesAverage(points) : null;
    const averagePart = average ? `, average ${Number(average.value.toPrecision(4))}${s.unitLabel ? ` ${s.unitLabel}` : ''} over ${average.count} points` : '';
    return `${s.label}: latest ${last.actual}${s.unitLabel ? ` ${s.unitLabel}` : ''} at ${formatDateTime(last.measured)}${anomalyPart}${averagePart}`;
  });
  return parts.join(' · ');
}

export function TelemetryChart({
  series,
  height = 320,
  mode = 'single',
  showControlLimits = false,
  title,
  emptyLabel,
  timeAxis = 'dateTime',
  compact = false,
  emphasizeHover = false,
  averageLine = false,
  plainTooltip = false,
  detailedLimits = false,
  onEnlarge,
}: TelemetryChartProps) {
  const styles = useStyles();
  const summaryId = useId();
  // The latest callback without rebuilding the chart options (and so the chart) every time the caller re-renders.
  const enlargeRef = useRef(onEnlarge);
  useEffect(() => {
    enlargeRef.current = onEnlarge;
  });
  const enlargeable = onEnlarge !== undefined;

  const { data, options } = useMemo<{ data: ChartData<'line'>; options: ChartOptions<'line'> }>(() => {
    const labelSet = new Set<string>();
    series.forEach((s) => s.points.forEach((p) => p.measured && labelSet.add(p.measured)));
    const labels = Array.from(labelSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const datasets: ChartData<'line'>['datasets'] = [];

    series.forEach((s, seriesIndex) => {
      const color = seriesPalette[seriesIndex % seriesPalette.length]!;
      const dash = seriesDashPatterns[seriesIndex % seriesDashPatterns.length];
      const manyPoints = s.points.length > MANY_POINTS;
      const byLabel = new Map(s.points.filter((p) => p.measured).map((p) => [p.measured!, p]));
      const aligned = labels.map((label) => byLabel.get(label) ?? null);

      const actualDataset: ChartData<'line'>['datasets'][number] = {
        label: s.label,
        data: aligned.map((p) => p?.actual ?? null),
        borderColor: color,
        backgroundColor: color,
        borderDash: dash,
        spanGaps: false,
        tension: manyPoints ? 0 : 0.2,
        // A long range (a day of 5-second readings is ~17,000 points) is drawn as a line: markers only where a point is anomalous.
        pointRadius: aligned.map((p) => (p && (!manyPoints || anomalyLevel(p) > 0) ? POINT_RADIUS : 0)),
        ...(emphasizeHover ? { pointHoverRadius: POINT_RADIUS * 5, pointHoverBorderWidth: 2 } : {}),
        pointBackgroundColor: aligned.map((p) => (p ? anomalyPointColor(p, color) : color)),
        borderWidth: 2,
      };

      if (detailedLimits && mode === 'single') {
        datasets.push(...detailedDatasets(s, aligned, actualDataset, emphasizeHover));
        return;
      }

      // The control limits are the server's own calculation (the analysis stores UCL3/LCL3 per point); a line is drawn only when
      // the series has such values. With several series each pair of limits takes its series' colour so it is clear whose they are.
      if (showControlLimits) {
        const limitColor = series.length > 1 ? color : tokens.colorNeutralStroke2;
        const limitDash = series.length > 1 ? [2, 3] : [6, 4];
        const upper = aligned.map((p) => p?.upperControlLimit3S ?? null);
        const lower = aligned.map((p) => p?.lowerControlLimit3S ?? null);
        for (const [name, values] of [['UCL3', upper], ['LCL3', lower]] as const) {
          if (!values.some((v) => v !== null)) continue;
          datasets.push({
            label: `${s.label} ${name}`,
            data: values,
            borderColor: limitColor,
            borderDash: limitDash,
            pointRadius: 0,
            ...(emphasizeHover ? { pointHoverRadius: 0 } : {}),
            borderWidth: 1,
          });
        }
      }

      if (averageLine) {
        const average = seriesAverage(s.points);
        if (average) {
          datasets.push({
            label: `${s.label} average`,
            data: labels.map(() => average.value),
            borderColor: color,
            borderDash: [10, 4],
            pointRadius: 0,
            ...(emphasizeHover ? { pointHoverRadius: 0 } : {}),
            borderWidth: 1.5,
          });
        }
      }

      if (mode === 'single') {
        const target = s.bidirectional
          ? aligned.map((p) => p?.targetAbove ?? null)
          : aligned.map((p) => p?.target ?? null);
        datasets.push({
          label: `${s.label} Target`,
          data: target,
          borderColor: anomalyColors.warning,
          borderDash: [4, 4],
          pointRadius: 0,
          ...(emphasizeHover ? { pointHoverRadius: 0 } : {}),
          borderWidth: 1.5,
        });
      }

      datasets.push(actualDataset);
    });

    const chartData: ChartData<'line'> = { labels, datasets };

    const axisUnit = sharedUnitLabel(series);

    const chartOptions: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      // The marker that grows is the point the tooltip shows (nearest by x position), not only a point the cursor sits exactly on.
      ...(emphasizeHover ? { interaction: { mode: 'index' as const, intersect: false } } : {}),
      ...(enlargeable
        ? {
            onClick: (event, _elements, chart) => {
              if (!isInsideLegend(chart, event.x, event.y)) enlargeRef.current?.();
            },
            onHover: (event, _elements, chart) => {
              chart.canvas.style.cursor = isInsideLegend(chart, event.x, event.y) ? 'default' : 'zoom-in';
            },
          }
        : {}),
      // No animation for a very long range (it only delays the first paint), or when the user prefers reduced motion.
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches || series.some((s) => s.points.length > MANY_POINTS) ? false : undefined,
      plugins: {
        title: { display: !!title, text: title },
        // A compact chart's legend only names the lines: clicking it must not hide one.
        legend: {
          position: 'top',
          ...(compact ? { onClick: () => undefined } : {}),
          ...(detailedLimits && mode === 'single'
            ? {
                labels: {
                  generateLabels: (chart: ChartJS) =>
                    ChartJS.defaults.plugins.legend.labels.generateLabels(chart).map((item) => ({ ...item, text: plainLegendName(series, item.text) })),
                },
              }
            : {}),
        },
        tooltip: {
          enabled: !compact,
          mode: 'index',
          intersect: false,
          // Only the measured value and its target; the limits (and any other derived line) are not listed.
          ...(plainTooltip ? { filter: (item: { dataset: { label?: string } }) => plainTooltipName(series, item.dataset.label) !== undefined } : {}),
          callbacks: {
            ...(timeAxis !== 'dateTime' ? { title: (items) => (items[0] ? formatDateTime(items[0].label) : '') } : {}),
            // The unit comes from the API metadata of the series, never from the metric name.
            label(context) {
              const unit = unitLabelOfDataset(series, context.dataset.label);
              const value = `${context.formattedValue}${unit ? ` ${unit}` : ''}`;
              if (plainTooltip) return `${plainTooltipName(series, context.dataset.label) ?? context.dataset.label ?? ''}: ${value}`;
              return `${context.dataset.label ?? ''}: ${value}`;
            },
          },
        },
      },
      scales: {
        y: axisUnit ? { title: { display: true, text: axisUnit } } : {},
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 0,
            callback(_value, index) {
              const label = labels[index];
              if (!label) return '';
              if (timeAxis === 'time') return formatTime(label);
              if (timeAxis === 'fullDateTime') return formatShortDateTime(label);
              return formatDateTime(label).replace(/^\d{4}-/, '');
            },
          },
        },
      },
    };

    return { data: chartData, options: chartOptions };
  }, [series, mode, showControlLimits, averageLine, plainTooltip, detailedLimits, title, timeAxis, compact, emphasizeHover, enlargeable]);

  const isEmpty = series.every((s) => s.points.length === 0);

  return (
    <div className={styles.root}>
      <div className={styles.canvasWrap} style={{ height }}>
        {isEmpty ? (
          <Text className={styles.summary}>{emptyLabel ?? 'No telemetry in this range.'}</Text>
        ) : (
          <Line data={data} options={options} aria-labelledby={summaryId} />
        )}
      </div>
      {!isEmpty && (
        <Text id={summaryId} size={200} className={compact ? styles.summaryHidden : styles.summary}>
          {summarize(series, averageLine)}
        </Text>
      )}
    </div>
  );
}
