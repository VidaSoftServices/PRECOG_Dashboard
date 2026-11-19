import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  Spinner,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, DocumentArrowUp24Regular } from '@fluentui/react-icons';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import {
  useBulkCreateAggregationPolicies,
  useBulkDeactivateAggregationPolicies,
  type BulkAggregationResultDto,
} from '@/api/hooks/aggregationPolicies';
import { fetchDeviceAggregationPolicies } from '@/api/hooks/deviceConfiguration';
import type { SensorDto } from '@/api/hooks/sensors';
import { filterSensors } from '@/lib/sensorFilter';
import { downloadTextFile } from '@/lib/downloadFile';
import {
  aggregationExportFileName,
  aggregationTemplateFileName,
  buildAggregationExportCsv,
  buildAggregationTemplateCsv,
  describeGroup,
  parseAggregationSheet,
  AGGREGATION_SHEET_HEADERS,
} from '@/lib/aggregationSheet';
import {
  AGGREGATION_FUNCTION_OPTIONS,
  DEFAULT_TIME_ZONE,
  SCALE_OPTIONS,
  TIME_SCALE_OPTIONS,
  timeZoneOptions,
  type Option,
} from '@/lib/aggregationOptions';
import { useT } from '@/lib/language';

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
  problems: { maxHeight: '160px', overflowY: 'auto', margin: 0, paddingLeft: tokens.spacingHorizontalXL },
});

type Mode = 'create' | 'deactivate' | 'import';

function Choice({ label, hint, value, onChange, options }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: readonly Option[] }) {
  const t = useT();
  return (
    <Field label={label} required hint={hint}>
      <Select value={value} onChange={(_, d) => onChange(d.value)}>
        <option value="">{t('Choose…')}</option>
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

/** At most this many problems are listed; the count says how many there are. */
const MAX_LISTED_PROBLEMS = 50;

/**
 * "Bulk aggregation": gives the same aggregation level (time scale + function) to many Sensors of the Device in ONE request, switches that level off
 * again, or - **Import from CSV** - applies a whole sheet of levels (one row per Sensor and level, see `aggregationSheet.ts`; the prepared
 * `aggregation-KS5.csv` style, whose `level` and `why` columns are ignored) as one request per distinct setting. **Export** downloads the Device's current
 * levels in the same columns, so an export edited in Excel imports back. A Device can have hundreds of Sensors; the per-Sensor "Add aggregation level" form is
 * one at a time. The source is always the measured value. The result lists what happened per Sensor (Created / Reactivated / Exists / Deactivated /
 * NotFound) with the API's remarks - for example that a level was stored but is not calculated because that kind of Sensor is not supported by the
 * aggregation engine yet. A level that already exists gets the settings of the request (Updated, with the changes listed: lookback, scale, min issue
 * score, time zone), so a sheet edited and imported again takes effect; one that already has exactly those settings is left as it is (Exists).
 * Company Admin only.
 */
export function BulkAggregationDialog({ deviceId, sensors, open, onClose }: { deviceId: number; sensors: readonly SensorDto[]; open: boolean; onClose: () => void }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const create = useBulkCreateAggregationPolicies(deviceId);
  const deactivate = useBulkDeactivateAggregationPolicies(deviceId);
  const timeZones = useMemo(() => timeZoneOptions(), []);
  const fileInput = useRef<HTMLInputElement>(null);

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
  const [sheetText, setSheetText] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [result, setResult] = useState<BulkAggregationResultDto | null>(null);
  const [importFailure, setImportFailure] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const mutation = mode === 'deactivate' ? deactivate : create;
  const parsed = useMemo(() => (mode === 'import' && sheetText.trim() !== '' ? parseAggregationSheet(sheetText, sensors) : null), [mode, sheetText, sensors]);
  const shown = filterSensors(sensors, filter);
  const count = which === 'all' ? sensors.length : chosen.size;
  const ready =
    mode === 'import'
      ? parsed !== null && parsed.problems.length === 0 && parsed.groups.length > 0
      : count > 0 && timeScale !== '' && aggregationFunction !== '' && (mode === 'deactivate' || (scale !== '' && Number(lookback) > 0));

  const close = () => {
    if (mutation.isPending) return;
    create.reset();
    deactivate.reset();
    setResult(null);
    setImportFailure(null);
    onClose();
  };

  const toggle = (id: number, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const exportLevels = async () => {
    setExporting(true);
    try {
      const policies = await fetchDeviceAggregationPolicies(queryClient, deviceId);
      downloadTextFile(aggregationExportFileName(deviceId), buildAggregationExportCsv(policies ?? [], sensors));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('The export failed.'), t('Export failed'));
    } finally {
      setExporting(false);
    }
  };

  /** A sample sheet written for this Device's own first Sensors: valid as it stands, to be edited and uploaded again. */
  const downloadTemplate = () => downloadTextFile(aggregationTemplateFileName(), buildAggregationTemplateCsv(sensors));

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setSheetName(file.name);
    // FileReader rather than file.text(): it exists in every browser and test environment.
    setSheetText(
      await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
        reader.readAsText(file);
      }),
    );
  };

  /** One request per distinct setting; the first failure stops the rest (what was done stays done and is reported). */
  const submitImport = async () => {
    if (!parsed) return;
    const total: BulkAggregationResultDto = { created: 0, reactivated: 0, updated: 0, alreadyExisted: 0, deactivated: 0, skipped: 0, items: [] };
    setImportFailure(null);
    try {
      for (const group of parsed.groups) {
        const outcome = await create.mutateAsync({
          sensorIds: group.sensorIds,
          timeScale: group.timeScale,
          aggregationFunction: group.aggregationFunction,
          scale: group.scale,
          lookback: group.lookback,
          minIssueScore: group.minIssueScore ?? undefined,
          timeZone: group.timeZone,
        });
        total.created = (total.created ?? 0) + (outcome.created ?? 0);
        total.reactivated = (total.reactivated ?? 0) + (outcome.reactivated ?? 0);
        total.updated = (total.updated ?? 0) + (outcome.updated ?? 0);
        total.alreadyExisted = (total.alreadyExisted ?? 0) + (outcome.alreadyExisted ?? 0);
        total.skipped = (total.skipped ?? 0) + (outcome.skipped ?? 0);
        const label = describeGroup(group);
        total.items = [...(total.items ?? []), ...(outcome.items ?? []).map((i) => ({ ...i, message: [label, i.message].filter(Boolean).join(' — ') }))];
      }
      setResult(total);
      toast.success(t('Imported: {0} created, {1} switched on again, {2} updated, {3} already there.', total.created, total.reactivated, total.updated, total.alreadyExisted));
    } catch (error) {
      setImportFailure(error instanceof Error ? error.message : 'The import stopped because of an error.');
      if ((total.items?.length ?? 0) > 0) setResult(total);
    }
  };

  const submit = async () => {
    if (mode === 'import') {
      await submitImport();
      return;
    }
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
        ? t('Aggregation level: {0} created, {1} switched on again, {2} updated, {3} already there.', outcome.created ?? 0, outcome.reactivated ?? 0, outcome.updated ?? 0, outcome.alreadyExisted ?? 0)
        : t('Aggregation level deactivated for {0} Sensor(s).', outcome.deactivated ?? 0),
    );
  };

  const level = `${labelOf(TIME_SCALE_OPTIONS, timeScale)} · ${labelOf(AGGREGATION_FUNCTION_OPTIONS, aggregationFunction)}`;
  const shownProblems = parsed?.problems.slice(0, MAX_LISTED_PROBLEMS) ?? [];
  const buttonLabel =
    mode === 'import'
      ? t('Import {0} level(s) for {1} Sensor(s)', parsed?.groups.length ?? 0, parsed?.sensorCount ?? 0)
      : mode === 'create'
        ? t('Add for {0} Sensor(s)', count)
        : t('Deactivate for {0} Sensor(s)', count);

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: '760px', width: '95vw' }}>
        <DialogBody>
          <DialogTitle>{t('Bulk aggregation')}</DialogTitle>
          <DialogContent>
            {result ? (
              <div className={styles.body}>
                <MessageBar intent={importFailure ? 'warning' : 'success'}>
                  <MessageBarBody>
                    {mode === 'deactivate'
                      ? t('{0} deactivated, {1} left as they were.', result.deactivated ?? 0, result.skipped ?? 0)
                      : t('{0} created, {1} switched on again, {2} updated, {3} already existed, {4} not found.', result.created ?? 0, result.reactivated ?? 0, result.updated ?? 0, result.alreadyExisted ?? 0, result.skipped ?? 0)}{' '}
                    {importFailure
                      ? t('The import stopped at an error: {0} What is listed below was done; the rest was not tried.', importFailure)
                      : t('The API calculates the values in the background, oldest data first.')}
                  </MessageBarBody>
                </MessageBar>
                <ul className={styles.results}>
                  {(result.items ?? []).map((item, index) => (
                    <li key={`${item.sensorId}-${item.outcome}-${index}`}>
                      <Text weight="semibold">{item.name ?? t('Sensor {0}', item.sensorId)}</Text>: {item.outcome}
                      {item.message ? ` — ${item.message}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className={styles.body}>
                <RadioGroup layout="horizontal" aria-label={t('What to do')} value={mode} onChange={(_, d) => setMode(d.value as Mode)}>
                  <Radio value="create" label={t('Add the level')} />
                  <Radio value="deactivate" label={t('Deactivate the level')} />
                  <Radio value="import" label={t('Import from CSV')} />
                </RadioGroup>

                {mode === 'import' ? (
                  <>
                    <Text size={200}>
                      {t('One row per Sensor and level:')}{' '}<code>{AGGREGATION_SHEET_HEADERS.join(', ')}</code>. <code>{t('sensorName')}</code> {t('is the Sensor’s external id;')}{' '}
                      <code>{t('timeScale')}</code>, <code>{t('aggregationFunction')}</code>, <code>{t('scale')}</code> {t('and')}{' '}<code>{t('lookback')}</code> {t('are required,')}{' '}<code>{t('minIssueScore')}</code> {t('and')}{' '}
                      <code>{t('timeZone')}</code> {t('are optional (defaults 1 and UTC). The columns')}{' '}<code>{t('level')}</code> {t('and')}{' '}<code>{t('why')}</code> {t('are ignored. A level a Sensor already has gets the sheet’s settings (listed as Updated); a new time zone recalculates its history.')}</Text>
                    <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button icon={<ArrowDownload24Regular />} onClick={downloadTemplate}>
                        {t('Download sample (CSV)')}</Button>
                      <Button icon={exporting ? <Spinner size="tiny" /> : <ArrowDownload24Regular />} onClick={() => void exportLevels()} disabled={exporting}>
                        {t('Download current levels (CSV)')}</Button>
                      <input
                        ref={fileInput}
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        aria-label={t('Choose a CSV file')}
                        hidden
                        onChange={(e) => {
                          void readFile(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                      <Button appearance="primary" icon={<DocumentArrowUp24Regular />} onClick={() => fileInput.current?.click()}>
                        {t('Upload CSV…')}</Button>
                      {sheetName && <Text size={200}>{sheetName}</Text>}
                    </div>
                    <Field label={t('…or paste the cells')} hint={t('Copied from Excel (tab separated) or CSV text; the first row is the header.')}>
                      <Textarea
                        rows={5}
                        value={sheetText}
                        onChange={(_, d) => {
                          setSheetText(d.value);
                          setSheetName('');
                        }}
                      />
                    </Field>
                    {parsed && parsed.problems.length === 0 && (
                      <MessageBar intent="success">
                        <MessageBarBody>
                          {parsed.rowCount} {t('row(s) for')}{' '}{parsed.sensorCount} {t('Sensor(s) make')}{' '}{parsed.groups.length} {t('request(s):')}<ul className={styles.problems}>
                            {parsed.groups.map((g) => (
                              <li key={describeGroup(g)}>
                                {describeGroup(g)}: {g.sensorIds.length} {t('Sensor(s)')}</li>
                            ))}
                          </ul>
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    {parsed && parsed.problems.length > 0 && (
                      <MessageBar intent="error">
                        <MessageBarBody>
                          {t('Nothing is sent while the sheet has problems (')}{parsed.problems.length}):
                          <ul className={styles.problems}>
                            {shownProblems.map((p, i) => (
                              <li key={`${p.line}-${p.field}-${i}`}>
                                {p.line > 0 ? t('Line {0}, {1}: ', p.line, p.field) : ''}
                                {p.message}
                              </li>
                            ))}
                            {parsed.problems.length > shownProblems.length && <li>{t('…and')}{' '}{parsed.problems.length - shownProblems.length} {t('more.')}</li>}
                          </ul>
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    {parsed && parsed.ignoredColumns.length > 0 && (
                      <MessageBar intent="warning">
                        <MessageBarBody>{t('Ignored column(s):')}{' '}{parsed.ignoredColumns.join(', ')}.</MessageBarBody>
                      </MessageBar>
                    )}
                  </>
                ) : (
                  <>
                    <div className={styles.row}>
                      <Choice label={t('Time scale')} hint={t('The length of one aggregated slice')} value={timeScale} onChange={setTimeScale} options={TIME_SCALE_OPTIONS} />
                      <Choice label={t('Aggregation function')} hint={t('How the values of one slice are combined')} value={aggregationFunction} onChange={setAggregationFunction} options={AGGREGATION_FUNCTION_OPTIONS} />
                    </div>
                    {mode === 'create' && (
                      <div className={styles.row}>
                        <Field label={t('Lookback')} required hint={t('Must be greater than zero')}>
                          <Input type="number" min="1" value={lookback} onChange={(_, d) => setLookback(d.value)} />
                        </Field>
                        <Choice label={t('Scale')} hint={t('The unit of Lookback')} value={scale} onChange={setScale} options={SCALE_OPTIONS} />
                        <Field label={t('Min issue score')} hint={t('Defaults to 1')}>
                          <Input type="number" value={minIssueScore} onChange={(_, d) => setMinIssueScore(d.value)} />
                        </Field>
                        <Field label={t('Time zone')} hint={t('Slices start and end at this zone\'s calendar boundaries')}>
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

                    <Body1Strong>{t('Sensors')}</Body1Strong>
                    <RadioGroup aria-label={t('Which Sensors')} value={which} onChange={(_, d) => setWhich(d.value as 'all' | 'chosen')}>
                      <Radio value="all" label={t('All {0} Sensor(s) of this Device', sensors.length)} />
                      <Radio value="chosen" label={t('Only the Sensors I choose ({0} chosen)', chosen.size)} />
                    </RadioGroup>
                    {which === 'chosen' && (
                      <>
                        <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Input aria-label={t('Filter Sensors')} placeholder={t('Filter by name…')} value={filter} onChange={(_, d) => setFilter(d.value)} />
                          <Button size="small" onClick={() => setChosen(new Set([...chosen, ...shown.map((s) => s.id!)]))}>
                            {t('Choose the')}{' '}{shown.length} {t('shown')}</Button>
                          <Button size="small" onClick={() => setChosen(new Set())} disabled={chosen.size === 0}>
                            {t('Clear')}</Button>
                        </div>
                        <div className={styles.list}>
                          {shown.map((s) => (
                            <Checkbox key={s.id} checked={chosen.has(s.id!)} onChange={(_, d) => toggle(s.id!, d.checked === true)} label={s.name || s.externalSensorId} />
                          ))}
                          {shown.length === 0 && <Text size={200}>{t('No Sensor matches the filter.')}</Text>}
                        </div>
                      </>
                    )}

                    <MessageBar intent="info">
                      <MessageBarBody>
                        {mode === 'create'
                          ? t('Aggregates the measured values. The API creates the level (or switches a disabled one on again) for every chosen Sensor in one step and then calculates its history in the background. A level that already exists gets these settings (lookback, scale, min issue score, time zone). Target and tolerance are never aggregated.')
                          : t('Switches the level off (the stored slices are kept). A Sensor without that level is left as it is. The raw level cannot be deactivated.')}
                      </MessageBarBody>
                    </MessageBar>
                    {ready && (
                      <Text>
                        {mode === 'create' ? t('Add') : t('Deactivate')} <b>{level}</b> {t('for')}{' '}<b>{count}</b> {t('Sensor(s).')}</Text>
                    )}
                  </>
                )}
                {mutation.isError && !importFailure && <ErrorState error={mutation.error} />}
                {importFailure && !result && <ErrorState error={new Error(importFailure)} />}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={mutation.isPending}>
              {result ? t('Close') : t('Cancel')}
            </Button>
            {!result && (
              <Button appearance="primary" disabled={!ready || mutation.isPending} onClick={() => void submit().catch(() => undefined)}>
                {mutation.isPending ? t('Working…') : buttonLabel}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
