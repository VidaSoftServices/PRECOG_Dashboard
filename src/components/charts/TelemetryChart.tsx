import { useId, useMemo } from 'react';
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
import { formatDateTime } from '@/lib/dateTime';

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
});

export interface TelemetrySeriesInput {
  label: string;
  points: TelemetryPoint[];
  bidirectional?: boolean;
}

interface TelemetryChartProps {
  series: TelemetrySeriesInput[];
  height?: number;
  /** 'single' shows control-limit bands, target/tolerance bands, and anomaly markers - built for one series. 'compare' shows clean overlay lines for legibility across several series (decision #17). */
  mode?: 'single' | 'compare';
  showControlLimits?: boolean;
  title?: string;
  emptyLabel?: string;
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
    return `${s.label}: latest ${last.actual} at ${formatDateTime(last.measured)}${anomalyPart}`;
  });
  return parts.join(' · ');
}

export function TelemetryChart({ series, height = 320, mode = 'single', showControlLimits = false, title, emptyLabel }: TelemetryChartProps) {
  const styles = useStyles();
  const summaryId = useId();

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
            borderWidth: 1,
          },
          {
            label: `${s.label} LCL3`,
            data: aligned.map((p) => p?.lowerControlLimit3S ?? null),
            borderColor: tokens.colorNeutralStroke2,
            borderDash: [6, 4],
            pointRadius: 0,
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
        pointRadius: aligned.map((p) => (p ? 3 : 0)),
        pointBackgroundColor: aligned.map((p) => (p ? anomalyPointColor(p, color) : color)),
        borderWidth: 2,
      });
    });

    const chartData: ChartData<'line'> = { labels, datasets };

    const chartOptions: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
      plugins: {
        title: { display: !!title, text: title },
        legend: { position: 'top' },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 0,
            callback(_value, index) {
              const label = labels[index];
              return label ? formatDateTime(label).replace(/^\d{4}-/, '') : '';
            },
          },
        },
      },
    };

    return { data: chartData, options: chartOptions };
  }, [series, mode, showControlLimits, title]);

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
        <Text id={summaryId} size={200} className={styles.summary}>
          {summarize(series)}
        </Text>
      )}
    </div>
  );
}
