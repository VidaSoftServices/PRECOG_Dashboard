import { Select } from '@fluentui/react-components';
import type { AggregationLevel } from '@/lib/aggregationLevels';
import { useT } from '@/lib/language';

/**
 * The aggregation picker of the chart windows (Live Monitoring's large window, Smart Analytics): "Raw readings" - the values as the Device sent
 * them - or one of the aggregation levels that exist. Rendered only where at least one level exists. `value` is the level key; '' = raw.
 */
export function AggregationSelect({
  levels,
  value,
  onChange,
  ariaLabel,
  rawCalculationOff = false,
}: {
  levels: readonly AggregationLevel[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
  /** True when the RAW calculation of the shown Sensor(s) is off: "Raw readings" says so, like a level whose calculation is off. */
  rawCalculationOff?: boolean;
}) {
  const t = useT();
  return (
    <Select aria-label={ariaLabel ?? t('Aggregation')} value={value} onChange={(_, d) => onChange(d.value)} size="small">
      <option value="">
        {t('Raw readings')}
        {rawCalculationOff ? ` · ${t('Calculation off')}` : ''}
      </option>
      {levels.map((level) => (
        <option key={level.key} value={level.key}>
          {t(level.label)}
          {level.calculationEnabled ? '' : ` · ${t('Calculation off')}`}
        </option>
      ))}
    </Select>
  );
}
