import { SCALES } from '@/lib/sensorImport';

/**
 * The values the "New aggregation level" form offers - only what the API knows (Enums.TimeScale, Enums.AggregationFunction),
 * so nothing is typed by hand. `value` is the enum name the API parses; `label` is what the person reads.
 *
 * Not offered, on purpose: the API also knows 1 millisecond and 1 second, but the shortest slice wanted is 15 seconds; the "Native" time scale and the "Raw" function (together with the data key Actual they identify a
 * Sensor's raw/base level, which the API creates with the Sensor itself), and any data key other than Actual (only measured
 * values are aggregated; target and tolerance are setpoint configuration and follow the setpoint that covers most of a slice).
 */
export const SOURCE_DATA_KEY = 'Actual';

export interface Option {
  value: string;
  label: string;
}

export const TIME_SCALE_OPTIONS: readonly Option[] = [
  { value: 'Seconds15', label: '15 seconds' },
  { value: 'Seconds30', label: '30 seconds' },
  { value: 'Minutes', label: '1 minute' },
  { value: 'Minutes15', label: '15 minutes' },
  { value: 'Minutes30', label: '30 minutes' },
  { value: 'Hours', label: '1 hour' },
  { value: 'Hours4', label: '4 hours' },
  { value: 'Hours12', label: '12 hours' },
  { value: 'Days', label: '1 day' },
  { value: 'Days3', label: '3 days' },
  { value: 'Weeks', label: '1 week' },
  { value: 'Weeks2', label: '2 weeks' },
  { value: 'Months', label: '1 month' },
  { value: 'Months3', label: '3 months' },
  { value: 'Months6', label: '6 months' },
  { value: 'Years', label: '1 year' },
];

export const AGGREGATION_FUNCTION_OPTIONS: readonly Option[] = [
  { value: 'AVG', label: 'Average' },
  { value: 'TIME_WEIGHTED_AVG', label: 'Time-weighted average' },
  { value: 'MIN', label: 'Minimum' },
  { value: 'MAX', label: 'Maximum' },
  { value: 'RANGE', label: 'Range (maximum minus minimum)' },
  { value: 'MEDIAN', label: 'Median' },
  { value: 'MODE', label: 'Most frequent value (mode)' },
  { value: 'RMS', label: 'Root mean square (RMS)' },
  { value: 'P95', label: '95th percentile' },
  { value: 'P99', label: '99th percentile' },
  { value: 'FIRST', label: 'First value' },
  { value: 'LAST', label: 'Last value' },
  { value: 'DELTA', label: 'Delta (last minus first)' },
  { value: 'SUM', label: 'Sum' },
  { value: 'INTEGRAL', label: 'Time-weighted integral (value x seconds)' },
  { value: 'COUNT', label: 'Count' },
  { value: 'STDDEV', label: 'Standard deviation' },
  { value: 'VARIANCE', label: 'Variance' },
  { value: 'SLOPE', label: 'Slope (linear regression, drift)' },
  { value: 'CHANGE_COUNT', label: 'Change count' },
  { value: 'COUNTER_INCREASE', label: 'Counter increase (handles resets)' },
];

/** The Scale (the unit of Lookback): the same set the Sensor forms and the import accept. */
export const SCALE_OPTIONS: readonly Option[] = SCALES.map((value) => ({ value, label: value === 'Periods' ? 'Periods (number of aggregation periods)' : value }));

export const DEFAULT_TIME_ZONE = 'UTC';

/** The IANA time zones the browser knows (what the API stores and uses for calendar-aligned boundaries), UTC first. */
export function timeZoneOptions(): Option[] {
  let names: string[] = [];
  try {
    names = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    names = [];
  }
  const rest = names.filter((n) => n !== DEFAULT_TIME_ZONE && n !== 'Etc/UTC');
  // A browser without the list still offers the common ones rather than a free text box.
  const fallback = ['Europe/Budapest', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo'];
  return [DEFAULT_TIME_ZONE, ...(rest.length > 0 ? rest : fallback)].map((value) => ({ value, label: value === DEFAULT_TIME_ZONE ? 'UTC (default)' : value }));
}
