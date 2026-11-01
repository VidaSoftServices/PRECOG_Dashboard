import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { ChartData, ChartOptions } from 'chart.js';
import { TelemetryChart } from './TelemetryChart';
import { seriesPalette } from './palette';
import type { TelemetryPoint } from '@/api/hooks/telemetry';

const drawn = vi.hoisted(() => ({ current: null as null | { data: ChartData<'line'>; options: ChartOptions<'line'> } }));
// jsdom has no canvas: the drawing is replaced by a stub that records what would have been drawn.
vi.mock('react-chartjs-2', () => ({
  Line: (props: { data: ChartData<'line'>; options: ChartOptions<'line'> }) => {
    drawn.current = props;
    return <canvas data-testid="chart-canvas" />;
  },
}));

const at = (n: number) => new Date(Date.UTC(2026, 9, 21, 0, 0, n)).toISOString();
const point = (n: number, actual: number | null, extra: Partial<TelemetryPoint> = {}): TelemetryPoint =>
  ({ measured: at(n), actual, ...extra }) as TelemetryPoint;

function renderChart(props: React.ComponentProps<typeof TelemetryChart>) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <TelemetryChart {...props} />
    </FluentProvider>,
  );
}
const datasets = () => drawn.current!.data.datasets;
const labels = () => datasets().map((d) => d.label);
const dataset = (label: string) => datasets().find((d) => d.label === label)!;

describe('TelemetryChart average line and control limits', () => {
  beforeEach(() => {
    drawn.current = null;
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  const A = [point(0, 1), point(1, 2), point(2, 6)];
  const B = [point(0, 10), point(1, 20)];

  it('draws one horizontal average line per series, at the mean of the plotted values, in the series\' colour', () => {
    renderChart({ series: [{ label: 'Fan 1 · X', points: A }, { label: 'Fan 2 · X', points: B }], mode: 'compare', averageLine: true });

    expect(labels()).toEqual(['Fan 1 · X average', 'Fan 1 · X', 'Fan 2 · X average', 'Fan 2 · X']);
    expect(dataset('Fan 1 · X average').data).toEqual([3, 3, 3]); // the same value at every time of the chart
    expect(dataset('Fan 2 · X average').data).toEqual([15, 15, 15]);
    expect(dataset('Fan 1 · X average')).toMatchObject({ borderColor: seriesPalette[0], pointRadius: 0 });
    expect(dataset('Fan 2 · X average')).toMatchObject({ borderColor: seriesPalette[1], pointRadius: 0 });
  });

  it('says the average (and how many readings it is made of) in the text summary, with the series\' unit', () => {
    renderChart({ series: [{ label: 'Fan 1 · X', points: A, unitLabel: 'mm/s' }], mode: 'compare', averageLine: true });

    expect(screen.getByText(/Fan 1 · X: latest 6 mm\/s/)).toHaveTextContent('average 3 mm/s over 3 points');
  });

  it('draws no average line unless asked, and none for a series without a single value', () => {
    renderChart({ series: [{ label: 'A', points: A }, { label: 'Empty', points: [point(0, null)] }], mode: 'compare' });
    expect(labels()).toEqual(['A', 'Empty']);

    drawn.current = null;
    renderChart({ series: [{ label: 'A', points: A }, { label: 'Empty', points: [point(0, null)] }], mode: 'compare', averageLine: true });
    expect(labels()).toEqual(['A average', 'A', 'Empty']);
  });

  it('draws the server\'s UCL3 and LCL3 for a comparison, in each series\' colour, only for a series that has them', () => {
    const withLimits = [point(0, 1, { upperControlLimit3S: 9, lowerControlLimit3S: -1 }), point(1, 2, { upperControlLimit3S: 9.5, lowerControlLimit3S: -1.5 })];
    renderChart({ series: [{ label: 'Fan 1 · X', points: withLimits }, { label: 'Fan 2 · X', points: B }], mode: 'compare', showControlLimits: true });

    expect(labels()).toEqual(['Fan 1 · X UCL3', 'Fan 1 · X LCL3', 'Fan 1 · X', 'Fan 2 · X']); // Fan 2 has none: no empty legend entries
    expect(dataset('Fan 1 · X UCL3').data).toEqual([9, 9.5]);
    expect(dataset('Fan 1 · X LCL3').data).toEqual([-1, -1.5]);
    expect(dataset('Fan 1 · X UCL3')).toMatchObject({ borderColor: seriesPalette[0], pointRadius: 0 });
  });

  it('keeps the neutral dashed limits of a single series, and draws a limit that only one end has', () => {
    renderChart({ series: [{ label: 'S', points: [point(0, 1, { upperControlLimit3S: 5 }), point(1, 2, { upperControlLimit3S: 6 })] }], mode: 'single', showControlLimits: true });

    expect(labels()).toContain('S UCL3');
    expect(labels()).not.toContain('S LCL3');
    expect(dataset('S UCL3')).toMatchObject({ borderDash: [6, 4] });
    expect(dataset('S UCL3').borderColor).not.toBe(seriesPalette[0]); // neutral grey, as before
  });

  it('draws no limit lines unless asked', () => {
    renderChart({ series: [{ label: 'S', points: [point(0, 1, { upperControlLimit3S: 5, lowerControlLimit3S: 0 })] }], mode: 'compare' });

    expect(labels()).toEqual(['S']);
  });

  it('draws a very long series as a plain line (markers only for anomalous points) and without animation', () => {
    const many = Array.from({ length: 1600 }, (_, i) => point(i, i % 7, i === 800 ? { anomaly: 2 } : {}));
    renderChart({ series: [{ label: 'Long', points: many }], mode: 'compare' });

    const radius = dataset('Long').pointRadius as number[];
    expect(radius.filter((r) => r > 0)).toEqual([3]); // the single anomalous point keeps its marker
    expect(radius).toHaveLength(1600);
    expect(drawn.current!.options.animation).toBe(false);
  });

  describe('plain tooltip (the Live Monitoring modal)', () => {
    const limited = [point(0, 1, { target: 5, upperControlLimit3S: 9, lowerControlLimit3S: -1 }), point(1, 2, { target: 5, upperControlLimit3S: 9, lowerControlLimit3S: -1 })];
    const series = [{ label: 'Fan RMS X', points: limited, unitLabel: 'mm/s' }];
    const tooltip = () => drawn.current!.options.plugins!.tooltip! as {
      filter?: (item: { dataset: { label?: string } }) => boolean;
      callbacks: { label: (context: { dataset: { label?: string }; formattedValue: string }) => string };
    };
    const labelOf = (label: string, formattedValue: string) => tooltip().callbacks.label({ dataset: { label }, formattedValue });

    it('lists only Actual and Target, with their values and the unit - not the Sensor\'s name and not the limits', () => {
      renderChart({ series, mode: 'single', showControlLimits: true, plainTooltip: true });

      // The limits are still drawn ...
      expect(labels()).toEqual(['Fan RMS X UCL3', 'Fan RMS X LCL3', 'Fan RMS X Target', 'Fan RMS X']);
      // ... but the tooltip names only the measured value and its target.
      const shown = ['Fan RMS X UCL3', 'Fan RMS X LCL3', 'Fan RMS X Target', 'Fan RMS X'].filter((l) => tooltip().filter!({ dataset: { label: l } }));
      expect(shown).toEqual(['Fan RMS X Target', 'Fan RMS X']);
      expect(labelOf('Fan RMS X', '2')).toBe('Actual: 2 mm/s');
      expect(labelOf('Fan RMS X Target', '5')).toBe('Target: 5 mm/s');
      expect(labelOf('Fan RMS X', '2')).not.toContain('Fan RMS X');
    });

    it('is off by default: every line is listed under its own name, as on every other chart', () => {
      renderChart({ series, mode: 'single', showControlLimits: true });

      expect(tooltip().filter).toBeUndefined();
      expect(labelOf('Fan RMS X', '2')).toBe('Fan RMS X: 2 mm/s');
      expect(labelOf('Fan RMS X UCL3', '9')).toBe('Fan RMS X UCL3: 9 mm/s');
    });

    it('leaves the unit out when the Sensor has none', () => {
      renderChart({ series: [{ label: 'Plain', points: limited }], mode: 'single', plainTooltip: true });

      expect(labelOf('Plain', '2')).toBe('Actual: 2');
      expect(labelOf('Plain Target', '5')).toBe('Target: 5');
    });
  });

  it('keeps the markers of a normal-length series', () => {
    renderChart({ series: [{ label: 'Short', points: A }], mode: 'compare' });

    expect(dataset('Short').pointRadius).toEqual([3, 3, 3]);
  });
});
