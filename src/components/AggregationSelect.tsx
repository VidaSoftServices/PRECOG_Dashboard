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
}: {
  levels: readonly AggregationLevel[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
}) {
  const t = useT();
  return (
    <Select aria-label={ariaLabel ?? t('Aggregation')} value={value} onChange={(_, d) => onChange(d.value)} size="small">
      <option value="">{t('Raw readings')}</option>
      {levels.map((level) => (
        <option key={level.key} value={level.key}>
          {t(level.label)}
        </option>
      ))}
    </Select>
  );
}
