import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { ChartData, ChartOptions } from 'chart.js';
import { TelemetryChart, type TelemetrySeriesInput } from './TelemetryChart';
import { plainLegendName, plainTooltipName } from './seriesNames';
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
const point = (n: number, extra: Partial<TelemetryPoint> = {}): TelemetryPoint => ({ measured: at(n), actual: 1.7, ...extra }) as TelemetryPoint;
const FULL = { target: 2, tolerance: 0.05, upperControlLimit3S: 1.99, upperControlLimit2S: 1.9, lowerControlLimit2S: 1.55, lowerControlLimit3S: 1.47 };

function renderDetailed(series: TelemetrySeriesInput[], props: Partial<React.ComponentProps<typeof TelemetryChart>> = {}) {
  return render(
    <FluentProvider theme={webLightTheme}>
      <TelemetryChart series={series} mode="single" detailedLimits {...props} />
    </FluentProvider>,
  );
}
const datasets = () => drawn.current!.data.datasets;
const labels = () => datasets().map((d) => d.label);
const dataset = (label: string) => datasets().find((d) => d.label === label)!;

describe('TelemetryChart detailedLimits (the Live Monitoring modal)', () => {
  beforeEach(() => {
    drawn.current = null;
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  const lowerIsBetter = (): TelemetrySeriesInput => ({ label: 'Pump', direction: 'lowerisbetter', points: [point(0, FULL), point(1, FULL)] });

  it('draws Target, Tolerance, the Actual line, then UCL3, UCL2, LCL2, LCL3 - the order of the original chart and its legend', () => {
    renderDetailed([lowerIsBetter()]);

    expect(labels()).toEqual(['Pump Target', 'Pump Tolerance', 'Pump', 'Pump UCL3', 'Pump UCL2', 'Pump LCL2', 'Pump LCL3']);
    expect(dataset('Pump Target').data).toEqual([2, 2]);
    expect(dataset('Pump UCL3').data).toEqual([1.99, 1.99]);
    expect(dataset('Pump UCL2').data).toEqual([1.9, 1.9]);
    expect(dataset('Pump LCL2').data).toEqual([1.55, 1.55]);
    expect(dataset('Pump LCL3').data).toEqual([1.47, 1.47]);
  });

  it('puts the tolerance line above the target when lower is better (target + tolerance), below it when higher is better (target - tolerance)', () => {
    renderDetailed([lowerIsBetter()]);
    expect(dataset('Pump Tolerance').data).toEqual([2.05, 2.05]);

    renderDetailed([{ label: 'Pump', direction: 'higherisbetter', points: [point(0, FULL), point(1, FULL)] }]);
    expect(dataset('Pump Tolerance').data).toEqual([1.95, 1.95]);
  });

  it('does not guess a side for the tolerance line when the direction is unknown, but still draws the target and the limits', () => {
    renderDetailed([{ label: 'Pump', points: [point(0, FULL)] }]);

    expect(labels()).toEqual(['Pump Target', 'Pump', 'Pump UCL3', 'Pump UCL2', 'Pump LCL2', 'Pump LCL3']);
  });

  it('shades the two bands: UCL2 is filled up to UCL3 and LCL3 down to LCL2', () => {
    renderDetailed([lowerIsBetter()]);

    expect(dataset('Pump UCL2')).toMatchObject({ fill: '-1' });
    expect(dataset('Pump LCL3')).toMatchObject({ fill: '-1' });
    expect(dataset('Pump UCL3').fill).toBeUndefined();
    expect(dataset('Pump LCL2').fill).toBeUndefined();
    // The datasets a band is filled to are the ones directly before it.
    const order = labels();
    expect(order[order.indexOf('Pump UCL2') - 1]).toBe('Pump UCL3');
    expect(order[order.indexOf('Pump LCL3') - 1]).toBe('Pump LCL2');
  });

  it('never fills towards a limit that is not there (that would shade down to the Actual line)', () => {
    renderDetailed([{ label: 'Pump', direction: 'lowerisbetter', points: [point(0, { target: 2, upperControlLimit2S: 1.9, lowerControlLimit3S: 1.47 })] }]);

    expect(dataset('Pump UCL3').data).toEqual([null]); // no UCL3 and no LCL2 value: those lines are listed but draw nothing
    expect(dataset('Pump LCL2').data).toEqual([null]);
    expect(dataset('Pump UCL2').fill).toBeUndefined();
    expect(dataset('Pump LCL3').fill).toBeUndefined();
  });

  it('always lists UCL3, UCL2, LCL2 and LCL3 in the legend, also when the platform has stored no limit at all (nothing is drawn for them)', () => {
    renderDetailed([{ label: 'Pump', direction: 'lowerisbetter', points: [point(0, { target: 2, tolerance: 0.05 }), point(1, { target: 2, tolerance: 0.05 })] }]);

    expect(labels()).toEqual(['Pump Target', 'Pump Tolerance', 'Pump', 'Pump UCL3', 'Pump UCL2', 'Pump LCL2', 'Pump LCL3']);
    for (const name of ['Pump UCL3', 'Pump UCL2', 'Pump LCL2', 'Pump LCL3']) expect(dataset(name).data).toEqual([null, null]);
    expect(dataset('Pump UCL2').fill).toBeUndefined(); // and no band either
  });

  it('lists the four limits even for a Sensor with no setpoint and no limits - just Actual plus the limit lines', () => {
    renderDetailed([{ label: 'Pump', direction: 'lowerisbetter', points: [point(0)] }]);

    expect(labels()).toEqual(['Pump', 'Pump UCL3', 'Pump UCL2', 'Pump LCL2', 'Pump LCL3']);
  });

  it('draws a bidirectional Sensor\'s four target and tolerance lines, each tolerance beyond its own target', () => {
    const both = { targetAbove: 100, toleranceAbove: 5, targetBelow: 50, toleranceBelow: 4 };
    renderDetailed([{ label: 'Rpm', bidirectional: true, direction: 'bidirectional', points: [point(0, both)] }]);

    expect(labels()).toEqual(['Rpm Target Above', 'Rpm Tolerance Above', 'Rpm Target Below', 'Rpm Tolerance Below', 'Rpm', 'Rpm UCL3', 'Rpm UCL2', 'Rpm LCL2', 'Rpm LCL3']);
    expect(dataset('Rpm Tolerance Above').data).toEqual([105]);
    expect(dataset('Rpm Tolerance Below').data).toEqual([46]);
  });

  it('is off by default: the small cards and every other chart keep their lines (no tolerance, no 2-sigma limits, no bands)', () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <TelemetryChart series={[lowerIsBetter()]} mode="single" showControlLimits />
      </FluentProvider>,
    );

    expect(labels()).toEqual(['Pump UCL3', 'Pump LCL3', 'Pump Target', 'Pump']);
    expect(labels().some((l) => /Tolerance|UCL2|LCL2/.test(String(l)))).toBe(false);
  });

  it('names the legend lines plainly - without the Sensor\'s name, the measured line is "Actual"', () => {
    renderDetailed([lowerIsBetter()]);
    const legend = drawn.current!.options.plugins!.legend!;
    expect((legend.labels as { generateLabels?: unknown }).generateLabels).toBeTypeOf('function');

    drawn.current = null;
    render(
      <FluentProvider theme={webLightTheme}>
        <TelemetryChart series={[lowerIsBetter()]} mode="single" showControlLimits />
      </FluentProvider>,
    );
    expect((drawn.current!.options.plugins!.legend!.labels as { generateLabels?: unknown } | undefined)?.generateLabels).toBeUndefined();
  });

  it('keeps the hover tooltip to Actual and Target, with the tolerance and the limits drawn but not listed', () => {
    renderDetailed([lowerIsBetter()], { plainTooltip: true });
    const tooltip = drawn.current!.options.plugins!.tooltip as { filter: (item: { dataset: { label?: string } }) => boolean };

    expect(labels().filter((l) => tooltip.filter({ dataset: { label: String(l) } }))).toEqual(['Pump Target', 'Pump']);
  });
});

describe('plain names', () => {
  const series = [{ label: 'Fan RMS X' }];

  it('plainLegendName: "Actual" for the measured line, the line\'s own name for the others, anything else untouched', () => {
    expect(plainLegendName(series, 'Fan RMS X')).toBe('Actual');
    expect(plainLegendName(series, 'Fan RMS X Target')).toBe('Target');
    expect(plainLegendName(series, 'Fan RMS X Tolerance Above')).toBe('Tolerance Above');
    expect(plainLegendName(series, 'Fan RMS X UCL3')).toBe('UCL3');
    expect(plainLegendName(series, 'Somebody else')).toBe('Somebody else');
  });

  it('plainTooltipName: only Actual and the target lines are named, everything else is left out', () => {
    expect(plainTooltipName(series, 'Fan RMS X')).toBe('Actual');
    expect(plainTooltipName(series, 'Fan RMS X Target')).toBe('Target');
    expect(plainTooltipName(series, 'Fan RMS X Target Above')).toBe('Target Above');
    expect(plainTooltipName(series, 'Fan RMS X Target Below')).toBe('Target Below');
    expect(plainTooltipName(series, 'Fan RMS X Tolerance')).toBeUndefined();
    expect(plainTooltipName(series, 'Fan RMS X UCL2')).toBeUndefined();
    expect(plainTooltipName(series, 'Fan RMS X average')).toBeUndefined();
    expect(plainTooltipName(series, undefined)).toBeUndefined();
  });
});
