import { useEffect, useId, useMemo, useRef } from 'react';
import { tr, translate, useLanguage } from '@/lib/language';
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
  type ChartType,
  type Plugin,
} from 'chart.js';
import { Text, makeStyles, tokens } from '@fluentui/react-components';
import type { TelemetryPoint } from '@/api/hooks/telemetry';
import { seriesPalette, seriesDashPatterns, anomalyColors } from './palette';
import { formatDateTime, formatShortDateTime, formatTime } from '@/lib/dateTime';
import { seriesAverage } from '@/lib/seriesAverage';
import { plainLegendName, plainTooltipName } from './seriesNames';
import { useT } from '@/lib/language';
import { pixelOfInstant, type ChartMaintenanceMarker } from '@/lib/maintenanceMarkers';

/** What the maintenance plugin draws (passed through the chart options, so a change redraws the chart). */
interface MaintenanceMarkerOptions {
  markers: readonly ChartMaintenanceMarker[];
  /** The chart's x labels (instants, sorted). */
  labels: readonly string[];
  /** Translated words for the labels at the top of the lines. */
  words: { replacement: string; minor: string; baseline: string; warmUp: string };
}

declare module 'chart.js' {
  interface PluginOptionsByType<TType extends ChartType> {
    maintenanceMarkers?: MaintenanceMarkerOptions;
  }
}

/** A Fluent colour token (a CSS variable) resolved for the canvas, which cannot read CSS variables itself. */
function cssColor(canvas: HTMLCanvasElement, variable: string, fallback: string): string {
  const value = getComputedStyle(canvas).getPropertyValue(variable).trim();
  return value || fallback;
}

/**
 * The maintenances of the chart (the user's request of 2026-11-19): a BLUE DASHED VERTICAL LINE at each maintenance - long dashes for a replacement /
 * repair, short ones for a minor maintenance - labelled at the top; when the maintenance's hours are visible (raw readings), a line at its start and one
 * at its end with a light band between (no data was stored then); after a replacement the warm-up (still measured against the previous baseline) is
 * lightly shaded. Positions are interpolated between the chart's instants; a maintenance outside the plotted range is not drawn.
 */
const maintenanceMarkerPlugin: Plugin<'line'> = {
  id: 'maintenanceMarkers',
  beforeDatasetsDraw(chart, _args, options) {
    const opts = options as unknown as MaintenanceMarkerOptions | undefined;
    if (!opts?.markers?.length || opts.labels.length === 0) return;
    const { ctx, chartArea } = chart;
    const scale = chart.scales.x;
    if (!scale) return;
    const pixelOf = (i: number) => scale.getPixelForValue(i);
    const color = cssColor(chart.canvas, '--colorBrandForeground1', '#0f6cbd');
    const first = Date.parse(opts.labels[0]!);
    const last = Date.parse(opts.labels[opts.labels.length - 1]!);
    ctx.save();
    ctx.fillStyle = color;
    for (const m of opts.markers) {
      // The maintenance itself (no data was stored), when it is wide enough to be seen.
      const xs = pixelOfInstant(opts.labels, m.startedAt, pixelOf);
      const xe = pixelOfInstant(opts.labels, m.endedAt, pixelOf);
      if (xs !== null && xe !== null && xe - xs > 6) {
        ctx.globalAlpha = 0.06;
        ctx.fillRect(xs, chartArea.top, xe - xs, chartArea.bottom - chartArea.top);
      }
      // The warm-up after a replacement.
      if (m.warmUpEndsAt) {
        const end = Date.parse(m.endedAt);
        const warm = Date.parse(m.warmUpEndsAt);
        if (warm > first && end < last) {
          const left = end < first ? chartArea.left : (pixelOfInstant(opts.labels, m.endedAt, pixelOf) ?? chartArea.left);
          const right = warm > last ? chartArea.right : (pixelOfInstant(opts.labels, m.warmUpEndsAt, pixelOf) ?? chartArea.right);
          if (right > left) {
            ctx.globalAlpha = 0.09;
            ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
            if (right - left > 60) {
              ctx.globalAlpha = 0.9;
              ctx.font = '10px "Segoe UI", system-ui, sans-serif';
              ctx.fillText(opts.words.warmUp, left + 4, chartArea.bottom - 6);
            }
          }
        }
      }
    }
    ctx.restore();
  },
  afterDatasetsDraw(chart, _args, options) {
    const opts = options as unknown as MaintenanceMarkerOptions | undefined;
    if (!opts?.markers?.length || opts.labels.length === 0) return;
    const { ctx, chartArea } = chart;
    const scale = chart.scales.x;
    if (!scale) return;
    const pixelOf = (i: number) => scale.getPixelForValue(i);
    const color = cssColor(chart.canvas, '--colorBrandForeground1', '#0f6cbd');
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    let labelRight = -Infinity;
    for (const m of opts.markers) {
      const replacement = m.kind === 'Replacement';
      const xs = m.manualBaseline ? null : pixelOfInstant(opts.labels, m.startedAt, pixelOf);
      const xe = pixelOfInstant(opts.labels, m.endedAt, pixelOf);
      const lines: number[] = [];
      if (xs !== null && xe !== null && xe - xs > 6) lines.push(xs);
      if (xe !== null) lines.push(xe);
      else if (xs !== null) lines.push(xs);
      if (lines.length === 0) continue;
      ctx.lineWidth = replacement ? 2 : 1.5;
      ctx.setLineDash(replacement ? [8, 5] : [3, 4]);
      for (const x of lines) {
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
      }
      // The label at the top of the (last) line; skipped when it would overlap the previous one.
      const text = `${replacement ? '⟳' : '○'} ${m.manualBaseline ? opts.words.baseline : replacement ? opts.words.replacement : opts.words.minor}`;
      const width = ctx.measureText(text).width;
      let x = lines[lines.length - 1]! + 4;
      if (x + width > chartArea.right) x = lines[lines.length - 1]! - 4 - width;
      if (x > labelRight + 4 && x >= chartArea.left) {
        ctx.fillText(text, x, chartArea.top + 12);
        labelRight = x + width;
      }
    }
    ctx.restore();
  },
};

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, maintenanceMarkerPlugin);

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
  /**
   * For the 'compare' overlay: each series also draws its own Target and Tolerance (the target compensated by the tolerance, on the side where a
   * deviation is bad; a bidirectional Sensor gets Above / Below) in the series' colour, next to its UCL3 / LCL3 - the reference an
   * comparison needs. Only where the API has the values; nothing is computed here but target +/- tolerance.
   */
  showSetpoint?: boolean;
  /** Called when the chart is clicked anywhere except on its legend (which keeps toggling series); the pointer shows a zoom cursor. */
  onEnlarge?: () => void;
  /**
   * The maintenances to mark (blue dashed vertical lines, a shaded warm-up after a replacement), from `maintenanceMarkers` (lib/maintenanceMarkers.ts).
   * The text summary lists them too.
   */
  maintenances?: readonly ChartMaintenanceMarker[];
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
 * Target and Tolerance (only where the API has a setpoint), the Actual line, then UCL3, UCL2, LCL2, LCL3 - the four limit lines are
 * ALWAYS part of the chart, so the legend always names them, even before the platform has stored any value for them (nothing is drawn
 * for such a line). A band is filled to the neighbouring limit ('-1'), so a limit is only paired with the one it sits next to, and only
 * when both have values.
 */
function detailedDatasets(
  s: TelemetrySeriesInput,
  aligned: (TelemetryPoint | null)[],
  actual: ChartData<'line'>['datasets'][number],
  emphasizeHover: boolean,
): ChartData<'line'>['datasets'] {
  const name = (suffix: string) => `${s.label} ${suffix}`;
  const plain = (suffix: string, data: (number | null)[], color: string, width: number, dash: number[], extra: object = {}) => ({
    label: name(translate(suffix)),
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
  // Always pushed (also with no value at all): the legend lists UCL3/UCL2/LCL2/LCL3 whether or not the platform has stored them yet.
  out.push(plain('UCL3', ucl3, LIMIT_COLOR_3S, 1.5, [30, 15]));
  out.push(plain('UCL2', ucl2, LIMIT_COLOR_2S, 1.5, [30, 15], has(ucl3) && has(ucl2) ? { fill: '-1', backgroundColor: LIMIT_BAND } : {}));
  out.push(plain('LCL2', lcl2, LIMIT_COLOR_2S, 1.5, [30, 15]));
  out.push(plain('LCL3', lcl3, LIMIT_COLOR_3S, 1.5, [30, 15], has(lcl2) && has(lcl3) ? { fill: '-1', backgroundColor: LIMIT_BAND } : {}));
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

/** The maintenances in the summary: "Maintenance: 2026-03-12 14:20 (replacement / repair), ..." - only those inside the plotted range. */
function summarizeMaintenances(markers: readonly ChartMaintenanceMarker[], labels: readonly string[]): string {
  if (markers.length === 0 || labels.length === 0) return '';
  const first = Date.parse(labels[0]!);
  const last = Date.parse(labels[labels.length - 1]!);
  const shown = markers.filter((m) => Date.parse(m.endedAt) >= first && Date.parse(m.startedAt) <= last);
  if (shown.length === 0) return '';
  const parts = shown.map((m) =>
    tr('{0} ({1})', formatDateTime(m.endedAt), m.manualBaseline ? translate('new baseline') : m.kind === 'Replacement' ? translate('replacement / repair') : translate('minor maintenance')),
  );
  return ' · ' + tr('Maintenance: {0}', parts.join(', '));
}

function summarize(series: TelemetrySeriesInput[], averageLine: boolean): string {
  if (series.length === 0 || series.every((s) => s.points.length === 0)) return translate('No data in range.');
  const parts = series.map((s) => {
    const points = s.points.filter((p) => p.actual != null);
    if (points.length === 0) return tr('{0}: no data', s.label);
    const last = points[points.length - 1]!;
    const criticalCount = points.filter((p) => (p.anomaly ?? Math.max(p.anomalyAbove ?? 0, p.anomalyBelow ?? 0)) === 2).length;
    const warningCount = points.filter((p) => (p.anomaly ?? Math.max(p.anomalyAbove ?? 0, p.anomalyBelow ?? 0)) === 1).length;
    const anomalyPart = criticalCount || warningCount ? tr(', {0} critical / {1} warning point(s)', criticalCount, warningCount) : '';
    const average = averageLine ? seriesAverage(points) : null;
    const averagePart = average ? tr(', average {0} over {1} points', `${Number(average.value.toPrecision(4))}${s.unitLabel ? ` ${s.unitLabel}` : ''}`, average.count) : '';
    return tr('{0}: latest {1} at {2}', s.label, `${last.actual}${s.unitLabel ? ` ${s.unitLabel}` : ''}`, formatDateTime(last.measured)) + anomalyPart + averagePart;
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
  showSetpoint = false,
  onEnlarge,
  maintenances,
}: TelemetryChartProps) {
  const t = useT();
  const styles = useStyles();
  const summaryId = useId();
  const { language } = useLanguage();
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
        // Each series has its own dash so the two series' limits can be told apart (the line colour already is the series').
        const limitDash = series.length > 1 ? (seriesIndex % 2 === 0 ? [6, 4] : [2, 4]) : [6, 4];
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
            borderWidth: 1.5,
          });
        }
      }

      if (showSetpoint && mode === 'compare') {
        const own = (suffix: string, values: (number | null)[], lineDash: number[]) => {
          if (!values.some((v) => v !== null)) return;
          datasets.push({
            label: `${s.label} ${translate(suffix)}`,
            data: values,
            borderColor: color,
            borderDash: lineDash,
            pointRadius: 0,
            ...(emphasizeHover ? { pointHoverRadius: 0 } : {}),
            borderWidth: 1.5,
          });
        };
        const plus = (a: number | null | undefined, b: number | null | undefined, sign: 1 | -1) => (a != null && b != null ? a + sign * b : null);
        if (s.bidirectional) {
          own('Target Above', aligned.map((p) => p?.targetAbove ?? null), [12, 3]);
          own('Tolerance Above', aligned.map((p) => plus(p?.targetAbove, p?.toleranceAbove, 1)), [3, 3]);
          own('Target Below', aligned.map((p) => p?.targetBelow ?? null), [12, 3]);
          own('Tolerance Below', aligned.map((p) => plus(p?.targetBelow, p?.toleranceBelow, -1)), [3, 3]);
        } else {
          own('Target', aligned.map((p) => p?.target ?? null), [12, 3]);
          // Without a known direction the tolerance side would be a guess: not drawn.
          const sign = s.direction === 'lowerisbetter' ? 1 : s.direction === 'higherisbetter' ? -1 : null;
          if (sign !== null) own('Tolerance', aligned.map((p) => plus(p?.target, p?.tolerance, sign)), [3, 3]);
        }
      }

      if (averageLine) {
        const average = seriesAverage(s.points);
        if (average) {
          datasets.push({
            label: `${s.label} ${translate('average')}`,
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
        // No target at all (an aggregated bucket has none) = no empty legend entry.
        if (target.some((v) => v !== null))
          datasets.push({
            label: `${s.label} ${translate('Target')}`,
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
        ...(maintenances && maintenances.length > 0
          ? {
              maintenanceMarkers: {
                markers: maintenances,
                labels,
                words: { replacement: translate('Replacement'), minor: translate('Minor maintenance'), baseline: translate('New baseline'), warmUp: translate('warm-up') },
              },
            }
          : {}),
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
  }, [series, mode, showControlLimits, averageLine, plainTooltip, detailedLimits, title, timeAxis, compact, emphasizeHover, enlargeable, language, maintenances]);

  const labelsForSummary = (data.labels ?? []) as string[];
  const maintenanceSummary = maintenances ? summarizeMaintenances(maintenances, labelsForSummary) : '';

  const isEmpty = series.every((s) => s.points.length === 0);

  return (
    <div className={styles.root}>
      <div className={styles.canvasWrap} style={{ height }}>
        {isEmpty ? (
          <Text className={styles.summary}>{emptyLabel ?? t('No telemetry in this range.')}</Text>
        ) : (
          <Line data={data} options={options} aria-labelledby={summaryId} />
        )}
      </div>
      {!isEmpty && (
        <Text id={summaryId} size={200} className={compact ? styles.summaryHidden : styles.summary}>
          {summarize(series, averageLine)}
          {maintenanceSummary}
        </Text>
      )}
      {!isEmpty && !compact && maintenanceSummary && (
        <Text size={200} className={styles.summary}>
          {t('Blue dashed line: maintenance (long dashes: replacement / repair, short dashes: minor maintenance); light blue after a replacement: the warm-up, still measured against the previous baseline.')}
        </Text>
      )}
    </div>
  );
}
