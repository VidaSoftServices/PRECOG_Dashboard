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

function anomalyPointColor(point: TelemetryPoint, base: string): string {
  const level = point.anomaly ?? Math.max(point.anomalyAbove ?? 0, point.anomalyBelow ?? 0);
  if (level === 2) return anomalyColors.critical;
  if (level === 1) return anomalyColors.warning;
  return base;
}

function summarize(series: TelemetrySeriesInput[]): string {
  if (series.length === 0 || series.every((s) => s.points.length === 0)) return 'No data in range.';
  const parts = series.map((s) => {
    const points = s.points.filter((p) => p.actual != null);
    if (points.length === 0) return `${s.label}: no data`;
    const last = points[points.length - 1]!;
    const criticalCount = points.filter((p) => (p.anomaly ?? Math.max(p.anomalyAbove ?? 0, p.anomalyBelow ?? 0)) === 2).length;
    const warningCount = points.filter((p) => (p.anomaly ?? Math.max(p.anomalyAbove ?? 0, p.anomalyBelow ?? 0)) === 1).length;
    const anomalyPart = criticalCount || warningCount ? `, ${criticalCount} critical / ${warningCount} warning point(s)` : '';
    return `${s.label}: latest ${last.actual}${s.unitLabel ? ` ${s.unitLabel}` : ''} at ${formatDateTime(last.measured)}${anomalyPart}`;
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
      const byLabel = new Map(s.points.filter((p) => p.measured).map((p) => [p.measured!, p]));
      const aligned = labels.map((label) => byLabel.get(label) ?? null);

      if (mode === 'single' && showControlLimits) {
        datasets.push(
          {
            label: `${s.label} UCL3`,
            data: aligned.map((p) => p?.upperControlLimit3S ?? null),
            borderColor: tokens.colorNeutralStroke2,
            borderDash: [6, 4],
            pointRadius: 0,
            ...(emphasizeHover ? { pointHoverRadius: 0 } : {}),
            borderWidth: 1,
          },
          {
            label: `${s.label} LCL3`,
            data: aligned.map((p) => p?.lowerControlLimit3S ?? null),
            borderColor: tokens.colorNeutralStroke2,
            borderDash: [6, 4],
            pointRadius: 0,
            ...(emphasizeHover ? { pointHoverRadius: 0 } : {}),
            borderWidth: 1,
          },
        );
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

      datasets.push({
        label: s.label,
        data: aligned.map((p) => p?.actual ?? null),
        borderColor: color,
        backgroundColor: color,
        borderDash: dash,
        spanGaps: false,
        tension: 0.2,
        pointRadius: aligned.map((p) => (p ? POINT_RADIUS : 0)),
        ...(emphasizeHover ? { pointHoverRadius: POINT_RADIUS * 5, pointHoverBorderWidth: 2 } : {}),
        pointBackgroundColor: aligned.map((p) => (p ? anomalyPointColor(p, color) : color)),
        borderWidth: 2,
      });
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
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
      plugins: {
        title: { display: !!title, text: title },
        // A compact chart's legend only names the lines: clicking it must not hide one.
        legend: { position: 'top', ...(compact ? { onClick: () => undefined } : {}) },
        tooltip: {
          enabled: !compact,
          mode: 'index',
          intersect: false,
          callbacks: {
            ...(timeAxis !== 'dateTime' ? { title: (items) => (items[0] ? formatDateTime(items[0].label) : '') } : {}),
            // The unit comes from the API metadata of the series, never from the metric name.
            label(context) {
              const unit = unitLabelOfDataset(series, context.dataset.label);
              return `${context.dataset.label ?? ''}: ${context.formattedValue}${unit ? ` ${unit}` : ''}`;
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
  }, [series, mode, showControlLimits, title, timeAxis, compact, emphasizeHover, enlargeable]);

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
          {summarize(series)}
        </Text>
      )}
    </div>
  );
}
