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

/** At most this many problems are listed; the count says how many there are. */
const MAX_LISTED_PROBLEMS = 50;

/**
 * "Bulk aggregation": gives the same aggregation level (time scale + function) to many Sensors of the Device in ONE request, switches that level off
 * again, or - **Import from CSV** - applies a whole sheet of levels (one row per Sensor and level, see `aggregationSheet.ts`; the prepared
 * `aggregation-KS5.csv` style, whose `level` and `why` columns are ignored) as one request per distinct setting. **Export** downloads the Device's current
 * levels in the same columns, so an export edited in Excel imports back. A Device can have hundreds of Sensors; the per-Sensor "Add aggregation level" form is
 * one at a time. The source is always the measured value. The result lists what happened per Sensor (Created / Reactivated / Exists / Deactivated /
 * NotFound) with the API's remarks - for example that a level was stored but is not calculated because that kind of Sensor is not supported by the
 * aggregation engine yet. A level that already exists is left as it is (its lookback is not changed by an import). Company Admin only.
 */
export function BulkAggregationDialog({ deviceId, sensors, open, onClose }: { deviceId: number; sensors: readonly SensorDto[]; open: boolean; onClose: () => void }) {
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
      toast.error(e instanceof Error ? e.message : 'The export failed.', 'Export failed');
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
    const total: BulkAggregationResultDto = { created: 0, reactivated: 0, alreadyExisted: 0, deactivated: 0, skipped: 0, items: [] };
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
        total.alreadyExisted = (total.alreadyExisted ?? 0) + (outcome.alreadyExisted ?? 0);
        total.skipped = (total.skipped ?? 0) + (outcome.skipped ?? 0);
        const label = describeGroup(group);
        total.items = [...(total.items ?? []), ...(outcome.items ?? []).map((i) => ({ ...i, message: [label, i.message].filter(Boolean).join(' — ') }))];
      }
      setResult(total);
      toast.success(`Imported: ${total.created} created, ${total.reactivated} switched on again, ${total.alreadyExisted} already there.`);
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
        ? `Aggregation level: ${outcome.created ?? 0} created, ${outcome.reactivated ?? 0} switched on again, ${outcome.alreadyExisted ?? 0} already there.`
        : `Aggregation level deactivated for ${outcome.deactivated ?? 0} Sensor(s).`,
    );
  };

  const level = `${labelOf(TIME_SCALE_OPTIONS, timeScale)} · ${labelOf(AGGREGATION_FUNCTION_OPTIONS, aggregationFunction)}`;
  const shownProblems = parsed?.problems.slice(0, MAX_LISTED_PROBLEMS) ?? [];
  const buttonLabel =
    mode === 'import'
      ? `Import ${parsed?.groups.length ?? 0} level(s) for ${parsed?.sensorCount ?? 0} Sensor(s)`
      : mode === 'create'
        ? `Add for ${count} Sensor(s)`
        : `Deactivate for ${count} Sensor(s)`;

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: '760px', width: '95vw' }}>
        <DialogBody>
          <DialogTitle>Bulk aggregation</DialogTitle>
          <DialogContent>
            {result ? (
              <div className={styles.body}>
                <MessageBar intent={importFailure ? 'warning' : 'success'}>
                  <MessageBarBody>
                    {mode === 'deactivate'
                      ? `${result.deactivated ?? 0} deactivated, ${result.skipped ?? 0} left as they were.`
                      : `${result.created ?? 0} created, ${result.reactivated ?? 0} switched on again, ${result.alreadyExisted ?? 0} already existed, ${result.skipped ?? 0} not found.`}{' '}
                    {importFailure
                      ? `The import stopped at an error: ${importFailure} What is listed below was done; the rest was not tried.`
                      : 'The API calculates the values in the background, oldest data first.'}
                  </MessageBarBody>
                </MessageBar>
                <ul className={styles.results}>
                  {(result.items ?? []).map((item, index) => (
                    <li key={`${item.sensorId}-${item.outcome}-${index}`}>
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
                  <Radio value="import" label="Import from CSV" />
                </RadioGroup>

                {mode === 'import' ? (
                  <>
                    <Text size={200}>
                      One row per Sensor and level: <code>{AGGREGATION_SHEET_HEADERS.join(', ')}</code>. <code>sensorName</code> is the Sensor’s external id;{' '}
                      <code>timeScale</code>, <code>aggregationFunction</code>, <code>scale</code> and <code>lookback</code> are required, <code>minIssueScore</code> and{' '}
                      <code>timeZone</code> are optional (defaults 1 and UTC). The columns <code>level</code> and <code>why</code> are ignored. A level a Sensor already has is left as it
                      is.
                    </Text>
                    <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button icon={<ArrowDownload24Regular />} onClick={downloadTemplate}>
                        Download sample (CSV)
                      </Button>
                      <Button icon={exporting ? <Spinner size="tiny" /> : <ArrowDownload24Regular />} onClick={() => void exportLevels()} disabled={exporting}>
                        Download current levels (CSV)
                      </Button>
                      <input
                        ref={fileInput}
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        aria-label="Choose a CSV file"
                        hidden
                        onChange={(e) => {
                          void readFile(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                      <Button appearance="primary" icon={<DocumentArrowUp24Regular />} onClick={() => fileInput.current?.click()}>
                        Upload CSV…
                      </Button>
                      {sheetName && <Text size={200}>{sheetName}</Text>}
                    </div>
                    <Field label="…or paste the cells" hint="Copied from Excel (tab separated) or CSV text; the first row is the header.">
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
                          {parsed.rowCount} row(s) for {parsed.sensorCount} Sensor(s) make {parsed.groups.length} request(s):
                          <ul className={styles.problems}>
                            {parsed.groups.map((g) => (
                              <li key={describeGroup(g)}>
                                {describeGroup(g)}: {g.sensorIds.length} Sensor(s)
                              </li>
                            ))}
                          </ul>
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    {parsed && parsed.problems.length > 0 && (
                      <MessageBar intent="error">
                        <MessageBarBody>
                          Nothing is sent while the sheet has problems ({parsed.problems.length}):
                          <ul className={styles.problems}>
                            {shownProblems.map((p, i) => (
                              <li key={`${p.line}-${p.field}-${i}`}>
                                {p.line > 0 ? `Line ${p.line}, ${p.field}: ` : ''}
                                {p.message}
                              </li>
                            ))}
                            {parsed.problems.length > shownProblems.length && <li>…and {parsed.problems.length - shownProblems.length} more.</li>}
                          </ul>
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    {parsed && parsed.ignoredColumns.length > 0 && (
                      <MessageBar intent="warning">
                        <MessageBarBody>Ignored column(s): {parsed.ignoredColumns.join(', ')}.</MessageBarBody>
                      </MessageBar>
                    )}
                  </>
                ) : (
                  <>
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
                            <Checkbox key={s.id} checked={chosen.has(s.id!)} onChange={(_, d) => toggle(s.id!, d.checked === true)} label={s.name || s.externalSensorId} />
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
                  </>
                )}
                {mutation.isError && !importFailure && <ErrorState error={mutation.error} />}
                {importFailure && !result && <ErrorState error={new Error(importFailure)} />}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close} disabled={mutation.isPending}>
              {result ? 'Close' : 'Cancel'}
            </Button>
            {!result && (
              <Button appearance="primary" disabled={!ready || mutation.isPending} onClick={() => void submit().catch(() => undefined)}>
                {mutation.isPending ? 'Working…' : buttonLabel}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
