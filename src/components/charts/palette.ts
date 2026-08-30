/**
 * Multi-series palette, blue-first (avoids red as a default series color -
 * red is reserved for anomaly/critical markers, matching the product's own
 * established convention, per git history: "avoid red in default"). Each
 * series is also distinguished by a distinct line-dash pattern (see
 * TelemetryChart) so color is never the only distinguishing signal.
 */
export const seriesPalette = [
  '#014F91', // PRECOG primary blue
  '#FF9F40', // orange
  '#6610F2', // purple
  '#007BFF', // light blue
  '#198754', // green
  '#17A2B8', // teal
  '#6F42C1', // dark purple
  '#FFCD56', // yellow
];

export const seriesDashPatterns: (number[] | undefined)[] = [undefined, [6, 3], [2, 2], [8, 3, 2, 3], [1, 3], [10, 4], [4, 4, 1, 4], [12, 3]];

export const anomalyColors = {
  critical: '#C23B22',
  warning: '#E0A100',
} as const;
