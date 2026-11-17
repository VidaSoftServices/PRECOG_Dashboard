import { useMemo, useState } from 'react';
import {
  Body1Strong,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Radio,
  RadioGroup,
  Select,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import {
  useBulkCreateAggregationPolicies,
  useBulkDeactivateAggregationPolicies,
  type BulkAggregationResultDto,
} from '@/api/hooks/aggregationPolicies';
import type { SensorDto } from '@/api/hooks/sensors';
import { filterSensors } from '@/lib/sensorFilter';
import {
  AGGREGATION_FUNCTION_OPTIONS,
  DEFAULT_TIME_ZONE,
  SCALE_OPTIONS,
  TIME_SCALE_OPTIONS,
  timeZoneOptions,
  type Option,
} from '@/lib/aggregationOptions';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: tokens.spacingHorizontalM },
  list: {
    maxHeight: '180px',
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalXS,
    display: 'flex',
    flexDirection: 'column',
  },
  results: { maxHeight: '240px', overflowY: 'auto', margin: 0, paddingLeft: tokens.spacingHorizontalXL },
});

type Mode = 'create' | 'deactivate';

function Choice({ label, hint, value, onChange, options }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: readonly Option[] }) {
  return (
    <Field label={label} required hint={hint}>
      <Select value={value} onChange={(_, d) => onChange(d.value)}>
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

const labelOf = (options: readonly Option[], value: string) => options.find((o) => o.value === value)?.label ?? value;

/**
 * "Bulk aggregation": gives the same aggregation level (time scale + function) to many Sensors of the Device in ONE request, or switches that
 * level off again for them. A Device can have hundreds of Sensors; the per-Sensor "Add aggregation level" form is one at a time. The source is
 * always the measured value. Which Sensors: all of them, or a filtered, ticked selection. The result lists what happened per Sensor (Created /
 * Reactivated / Exists / Deactivated / NotFound) with the API's remarks - for example that a level was stored but is not calculated because that
 * kind of Sensor is not supported by the aggregation engine yet. Company Admin only; the button that opens this is shown to an Admin only.
 */
export function BulkAggregationDialog({ deviceId, sensors, open, onClose }: { deviceId: number; sensors: readonly SensorDto[]; open: boolean; onClose: () => void }) {
  const styles = useStyles();
  const toast = useAppToast();
  const create = useBulkCreateAggregationPolicies(deviceId);
  const deactivate = useBulkDeactivateAggregationPolicies(deviceId);
  const timeZones = useMemo(() => timeZoneOptions(), []);

  const [mode, setMode] = useState<Mode>('create');
  const [which, setWhich] = useState<'all' | 'chosen'>('all');
  const [filter, setFilter] = useState('');
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());
  const [timeScale, setTimeScale] = useState('');
  const [aggregationFunction, setAggregationFunction] = useState('');
  const [scale, setScale] = useState('');
  const [lookback, setLookback] = useState('');
  const [minIssueScore, setMinIssueScore] = useState('');
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [result, setResult] = useState<BulkAggregationResultDto | null>(null);

  const mutation = mode === 'create' ? create : deactivate;
  const shown = filterSensors(sensors, filter);
  const count = which === 'all' ? sensors.length : chosen.size;
  const ready =
    count > 0 && timeScale !== '' && aggregationFunction !== '' && (mode === 'deactivate' || (scale !== '' && Number(lookback) > 0));

  const close = () => {
    if (mutation.isPending) return;
    create.reset();
    deactivate.reset();
    setResult(null);
    onClose();
  };

  const toggle = (id: number, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = async () => {
    const sensorIds = which === 'all' ? undefined : [...chosen];
    const outcome =
      mode === 'create'
        ? await create.mutateAsync({
            sensorIds,
            timeScale,
            aggregationFunction,
            scale,
            lookback: Number(lookback),
            minIssueScore: minIssueScore ? Number(minIssueScore) : undefined,
            timeZone,
          })
        : await deactivate.mutateAsync({ sensorIds, timeScale, aggregationFunction });
    setResult(outcome);
    toast.success(
      mode === 'create'
        ? `Aggregation level: ${outcome.created ?? 0} created, ${outcome.reactivated ?? 0} switched on again, ${outcome.alreadyExisted ?? 0} already there.`
        : `Aggregation level deactivated for ${outcome.deactivated ?? 0} Sensor(s).`,
    );
  };

  const level = `${labelOf(TIME_SCALE_OPTIONS, timeScale)} · ${labelOf(AGGREGATION_FUNCTION_OPTIONS, aggregationFunction)}`;

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: '760px', width: '95vw' }}>
        <DialogBody>
          <DialogTitle>Bulk aggregation</DialogTitle>
          <DialogContent>
            {result ? (
              <div className={styles.body}>
                <MessageBar intent="success">
                  <MessageBarBody>
                    {mode === 'create'
                      ? `${result.created ?? 0} created, ${result.reactivated ?? 0} switched on again, ${result.alreadyExisted ?? 0} already existed, ${result.skipped ?? 0} not found.`
                      : `${result.deactivated ?? 0} deactivated, ${result.skipped ?? 0} left as they were.`}{' '}
                    The API calculates the values in the background, oldest data first.
                  </MessageBarBody>
                </MessageBar>
                <ul className={styles.results}>
                  {(result.items ?? []).map((item) => (
                    <li key={`${item.sensorId}-${item.outcome}`}>
                      <Text weight="semibold">{item.name ?? `Sensor ${item.sensorId}`}</Text>: {item.outcome}
                      {item.message ? ` — ${item.message}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className={styles.body}>
                <RadioGroup layout="horizontal" aria-label="What to do" value={mode} onChange={(_, d) => setMode(d.value as Mode)}>
                  <Radio value="create" label="Add the level" />
                  <Radio value="deactivate" label="Deactivate the level" />
                </RadioGroup>

                <div className={styles.row}>
                  <Choice label="Time scale" hint="The length of one aggregated slice" value={timeScale} onChange={setTimeScale} options={TIME_SCALE_OPTIONS} />
                  <Choice label="Aggregation function" hint="How the values of one slice are combined" value={aggregationFunction} onChange={setAggregationFunction} options={AGGREGATION_FUNCTION_OPTIONS} />
                </div>
                {mode === 'create' && (
                  <div className={styles.row}>
                    <Field label="Lookback" required hint="Must be greater than zero">
                      <Input type="number" min="1" value={lookback} onChange={(_, d) => setLookback(d.value)} />
                    </Field>
                    <Choice label="Scale" hint="The unit of Lookback" value={scale} onChange={setScale} options={SCALE_OPTIONS} />
                    <Field label="Min issue score" hint="Defaults to 1">
                      <Input type="number" value={minIssueScore} onChange={(_, d) => setMinIssueScore(d.value)} />
                    </Field>
                    <Field label="Time zone" hint="Slices start and end at this zone's calendar boundaries">
                      <Select value={timeZone} onChange={(_, d) => setTimeZone(d.value)}>
                        {timeZones.map((z) => (
                          <option key={z.value} value={z.value}>
                            {z.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}

                <Body1Strong>Sensors</Body1Strong>
                <RadioGroup aria-label="Which Sensors" value={which} onChange={(_, d) => setWhich(d.value as 'all' | 'chosen')}>
                  <Radio value="all" label={`All ${sensors.length} Sensor(s) of this Device`} />
                  <Radio value="chosen" label={`Only the Sensors I choose (${chosen.size} chosen)`} />
                </RadioGroup>
                {which === 'chosen' && (
                  <>
                    <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Input aria-label="Filter Sensors" placeholder="Filter by name…" value={filter} onChange={(_, d) => setFilter(d.value)} />
                      <Button size="small" onClick={() => setChosen(new Set([...chosen, ...shown.map((s) => s.id!)]))}>
                        Choose the {shown.length} shown
                      </Button>
                      <Button size="small" onClick={() => setChosen(new Set())} disabled={chosen.size === 0}>
                        Clear
                      </Button>
                    </div>
                    <div className={styles.list}>
                      {shown.map((s) => (
                        <Checkbox
                          key={s.id}
                          checked={chosen.has(s.id!)}
                          onChange={(_, d) => toggle(s.id!, d.checked === true)}
                          label={s.name || s.externalSensorId}
                        />
                      ))}
                      {shown.length === 0 && <Text size={200}>No Sensor matches the filter.</Text>}
                    </div>
                  </>
                )}

                <MessageBar intent="info">
                  <MessageBarBody>
                    {mode === 'create'
                      ? 'Aggregates the measured values. The API creates the level (or switches a disabled one on again) for every chosen Sensor in one step and then calculates its history in the background. A level that already exists is left as it is. Target and tolerance are never aggregated.'
                      : 'Switches the level off (the stored slices are kept). A Sensor without that level is left as it is. The raw level cannot be deactivated.'}
                  </MessageBarBody>
                </MessageBar>
                {ready && (
                  <Text>
                    {mode === 'create' ? 'Add' : 'Deactivate'} <b>{level}</b> for <b>{count}</b> Sensor(s).
                  </Text>
                )}
                {mutation.isError && <ErrorState error={mutation.error} />}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={mutation.isPending}>
              {result ? 'Close' : 'Cancel'}
            </Button>
            {!result && (
              <Button appearance="primary" disabled={!ready || mutation.isPending} onClick={() => void submit().catch(() => undefined)}>
                {mutation.isPending ? 'Working…' : mode === 'create' ? `Add for ${count} Sensor(s)` : `Deactivate for ${count} Sensor(s)`}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
