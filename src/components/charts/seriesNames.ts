/** What the chart's dataset names are called on screen. A dataset is named `<series label>` (the measured line) or `<series label> <Line>` (Target, UCL3, ...). */
interface Named {
  label: string;
}

/**
 * The legend text of a single-series chart without the Sensor's name: the measured line is "Actual", every derived line keeps its own
 * name ("Target", "Tolerance", "UCL3", ...). A name that does not belong to a series is left as it is.
 */
export function plainLegendName(series: readonly Named[], text: string): string {
  for (const s of series) {
    if (text === s.label) return 'Actual';
    if (text.startsWith(`${s.label} `)) return text.slice(s.label.length + 1);
  }
  return text;
}

/**
 * The hover-tooltip name of a dataset in the plain tooltip: "Actual" for a series' own line, "Target" (or "Target Above" / "Target Below"
 * of a bidirectional Sensor) for its target line, undefined for every other dataset (tolerance, limits, average), which the plain
 * tooltip leaves out.
 */
export function plainTooltipName(series: readonly Named[], datasetLabel: string | undefined): string | undefined {
  if (!datasetLabel) return undefined;
  for (const s of series) {
    if (datasetLabel === s.label) return 'Actual';
    for (const name of ['Target', 'Target Above', 'Target Below']) {
      if (datasetLabel === `${s.label} ${name}`) return name;
    }
  }
  return undefined;
}
