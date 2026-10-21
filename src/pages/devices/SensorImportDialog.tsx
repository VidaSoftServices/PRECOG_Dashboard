import { useMemo, useRef, useState } from 'react';
import {
  Body1Strong,
  Button,
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
  ProgressBar,
  Select,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, DocumentArrowUp24Regular } from '@fluentui/react-icons';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useImportSensors, useSensors, type SensorImportOutcome } from '@/api/hooks/sensors';
import { useSensorMetadata } from '@/api/hooks/sensorMetadata';
import {
  DIRECTIONS,
  MAX_IMPORT_ROWS,
  SCALES,
  buildSensorIdMapCsv,
  buildTemplateCsv,
  parseSensorTable,
  toImportCatalog,
  type ImportCatalog,
  type ExistingSensorInfo,
  type ImportDefaults,
  type ParsedSensorRow,
  type SensorDirection,
} from '@/lib/sensorImport';
import { downloadBinaryFile, downloadTextFile } from '@/lib/downloadFile';
import { DATA_SETS_FILE_NAME, buildDataSetsWorkbook } from '@/lib/sensorDataSets';
import { XLSX_MIME_TYPE } from '@/lib/xlsxWriter';

const useStyles = makeStyles({
  surface: { maxWidth: '920px', width: '96vw' },
  content: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  row: { display: 'flex', gap: tokens.spacingHorizontalM, flexWrap: 'wrap', alignItems: 'flex-end' },
  defaults: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: tokens.spacingHorizontalM },
  textarea: { width: '100%', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  problems: { maxHeight: '180px', overflowY: 'auto', margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  preview: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200 },
  cell: { textAlign: 'left', padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  muted: { color: tokens.colorNeutralForeground3 },
});

/** The allowed unitCode values, listed from the API catalog next to the template. */
function AllowedValues({ catalog }: { catalog: ImportCatalog }) {
  const styles = useStyles();
  return (
    <div className={styles.muted} data-testid="allowed-values">
      <Text size={200} block>
        <b>unitCode</b> (stable code, not the label): {catalog.units.map((u) => `${u.code} (${u.label})`).join(', ')}.
      </Text>
      <Text size={200} block>
        A Sensor named like a known metric (machine name + point number) must carry exactly that metric&apos;s unitCode; other columns are optional.
      </Text>
    </div>
  );
}

/** "mm/s (mm_s)": the display label AND the stable code, so a raw_energy value is visibly raw_energy and never g. */
function unitText(catalog: ImportCatalog | undefined, code: string): string {
  if (!code) return '';
  const unit = catalog?.units.find((u) => u.code === code);
  return unit ? `${unit.label} (${code})` : code;
}

/** "target 5 ± 0.5" / "above 5 ± 1, below 3 ± 1": the row's setpoint as it will be recorded; '' when the row has none. */
function setpointText(setpoint: ParsedSensorRow['setpoint']): string {
  if (!setpoint) return '';
  const side = (label: string, target: number | undefined, tolerance: number | undefined) =>
    target === undefined ? [] : [`${label} ${target}${tolerance === undefined ? '' : ` ± ${tolerance}`}`];
  return [
    ...side('target', setpoint.target, setpoint.tolerance),
    ...side('above', setpoint.targetAbove, setpoint.toleranceAbove),
    ...side('below', setpoint.targetBelow, setpoint.toleranceBelow),
  ].join(', ');
}

const DEFAULTS: ImportDefaults = { direction: 'lowerisbetter', rawScale: '', rawLookback: '', rawMinIssueScore: '1', processingEnabled: true };
const PREVIEW_ROWS = 8;
const MAX_LISTED = 20;

/**
 * Bulk "Import Sensors" for one Device (Admin only): paste a range copied from
 * Excel, or choose a .csv, check the preview, and the Sensors are created one by
 * one in sheet order. A Device can have hundreds (a dual-point vibration
 * monitor has 326), which is hopeless to add by hand.
 *
 * Nothing new is invented on the server: every row becomes the same
 * `POST /api/Devices/{deviceId}/Sensors` call as the single "Add Sensor"
 * dialog, so each Sensor still gets its raw/base aggregation policy and the
 * same validation. `isCurve` follows the Device's own mode, never the sheet.
 * Validation is all-or-nothing before the first request (a typo on row 118 is
 * found now, not after 117 Sensors exist); rows whose externalSensorId already
 * exists on the Device are skipped, so re-running a sheet only adds what is missing.
 *
 * Afterwards the numeric Sensor ids can be downloaded as a map: a Device's
 * firmware needs `externalSensorId -> sensorId`, and the ids follow the sheet's order.
 */
export function SensorImportDialog({
  deviceId,
  applicationMode,
  open,
  onClose,
}: {
  deviceId: number;
  applicationMode: string | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const styles = useStyles();
  const toast = useAppToast();
  const sensorsQuery = useSensors(deviceId);
  const catalogQuery = useSensorMetadata();
  const catalog = useMemo(() => toImportCatalog(catalogQuery.data), [catalogQuery.data]);
  const importer = useImportSensors(deviceId);

  const [text, setText] = useState('');
  const [defaults, setDefaults] = useState<ImportDefaults>(DEFAULTS);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<SensorImportOutcome[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const running = importer.isPending;

  // The Sensors already on the Device: a row for one of them updates it (only the filled cells) instead of creating one.
  const existingSensors = useMemo(
    () => new Map((sensorsQuery.data ?? []).map((s) => [(s.externalSensorId ?? '').toLowerCase(), s])),
    [sensorsQuery.data],
  );
  const existingInfo = useMemo(
    () =>
      new Map<string, ExistingSensorInfo>(
        [...existingSensors].map(([key, s]) => [key, { direction: (DIRECTIONS as readonly string[]).includes(s.direction ?? '') ? (s.direction as SensorDirection) : 'lowerisbetter' }]),
      ),
    [existingSensors],
  );

  const parsed = useMemo(() => parseSensorTable(text, defaults, catalog, existingInfo), [text, defaults, catalog, existingInfo]);

  const withProblems = parsed.rows.filter((r) => r.errors.length > 0);
  const toCreate = parsed.rows.filter((r) => r.errors.length === 0 && !r.exists);
  const toUpdate = parsed.rows.filter((r) => r.errors.length === 0 && r.exists);
  const toApply = parsed.rows.filter((r) => r.errors.length === 0);
  const canImport = !running && parsed.fileErrors.length === 0 && withProblems.length === 0 && toApply.length > 0;

  const setDefault = <K extends keyof ImportDefaults>(key: K, value: ImportDefaults[K]) => setDefaults((d) => ({ ...d, [key]: value }));

  const close = () => {
    if (running) return;
    setText('');
    setOutcomes(null);
    setProgress(null);
    importer.reset();
    onClose();
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setOutcomes(null);
  };

  const start = () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setOutcomes(null);
    setProgress({ done: 0, total: toApply.length });
    importer.mutate(
      {
        rows: toApply,
        existing: existingSensors,
        isCurve: applicationMode === 'periodic',
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      },
      {
        onSuccess: (result) => {
          setOutcomes(result);
          const created = result.filter((o) => o.status === 'created').length;
          const updated = result.filter((o) => o.status === 'updated').length;
          const failed = result.filter((o) => o.status === 'failed').length;
          const summary = `${created} Sensor(s) created, ${updated} updated`;
          if (controller.signal.aborted) toast.info(`Import stopped: ${summary}.`);
          else if (failed > 0) toast.error(`${summary}, ${failed} failed.`);
          else toast.success(`${summary}.`);
        },
      },
    );
  };

  /** Ids for every sheet row that exists on the Device now - including ones that were already there. */
  const downloadIdMap = () => {
    const byExternalId = new Map((sensorsQuery.data ?? []).map((s) => [(s.externalSensorId ?? '').toLowerCase(), s]));
    const entries = parsed.rows.flatMap((r) => {
      const sensor = byExternalId.get(r.externalSensorId.toLowerCase());
      return sensor?.id == null ? [] : [{ externalSensorId: sensor.externalSensorId ?? r.externalSensorId, sensorId: sensor.id, name: sensor.name ?? '' }];
    });
    downloadTextFile(`sensor-ids-device-${deviceId}.csv`, buildSensorIdMapCsv(entries));
  };

  const created = outcomes?.filter((o) => o.status === 'created').length ?? 0;
  const updated = outcomes?.filter((o) => o.status === 'updated') ?? [];
  const unchanged = outcomes?.filter((o) => o.status === 'unchanged').length ?? 0;
  const skipped = outcomes?.filter((o) => o.status === 'skipped').length ?? 0;
  const failed = outcomes?.filter((o) => o.status === 'failed') ?? [];
  const setpointsSaved = outcomes?.filter((o) => o.setpoint === 'created').length ?? 0;
  const setpointsFailed = outcomes?.filter((o) => o.setpoint === 'failed') ?? [];

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Import Sensors</DialogTitle>
          <DialogContent className={styles.content}>
            <Text size={200} className={styles.muted}>
              Paste the cells you copied from Excel, or choose a .csv file. The first row is the header; only{' '}
              <b>sensorName</b> (the Sensor's externalSensorId) is required, every other column is optional and falls back to the defaults below. A new Sensor is created in
              sheet order, so numeric ids follow the rows. <b>A Sensor whose sensorName already exists is updated instead</b>: only the cells you fill are applied (an empty cell
              never overwrites, and the defaults below are not applied to it). Optional <b>target</b>/<b>tolerance</b> columns (bidirectional Sensors: <b>targetAbove</b>,{' '}
              <b>targetBelow</b>, <b>toleranceAbove</b>, <b>toleranceBelow</b>) are recorded as the Sensor&apos;s setpoint, effective from the moment of the import - for an existing Sensor
              a changed target or tolerance starts a new setpoint interval (the previous one ends there, history is kept) that keeps the values you left empty; a Sensor
              without a setpoint is stored but not analysed.
            </Text>

            <div className={styles.row}>
              <Button
                icon={<ArrowDownload24Regular />}
                disabled={!catalog}
                onClick={() => catalog && downloadTextFile('sensor-import-template.csv', buildTemplateCsv(catalog))}
              >
                Download template
              </Button>
              <Button
                icon={<ArrowDownload24Regular />}
                disabled={!catalog}
                onClick={() => catalog && downloadBinaryFile(DATA_SETS_FILE_NAME, buildDataSetsWorkbook(catalog), XLSX_MIME_TYPE)}
              >
                Download Data sets
              </Button>
              <Button icon={<DocumentArrowUp24Regular />} onClick={() => fileRef.current?.click()} disabled={running}>
                Choose .csv file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                hidden
                aria-label="Sensor CSV file"
                onChange={(e) => {
                  void readFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>

            {catalogQuery.isLoading && <Text size={200}>Loading the unit and aggregation catalog…</Text>}
            {catalogQuery.isError && <ErrorState error={catalogQuery.error} onRetry={() => catalogQuery.refetch()} />}
            {catalog && <AllowedValues catalog={catalog} />}

            <Field label="Sensor table" hint={`Header row plus up to ${MAX_IMPORT_ROWS} Sensors. Tab-, semicolon- and comma-separated text all work.`}>
              <Textarea
                className={styles.textarea}
                resize="vertical"
                rows={8}
                value={text}
                disabled={running}
                placeholder={'externalSensorId\tname\tunitCode\ntemperature_1\tMotor temperature\tCel'}
                onChange={(_, d) => {
                  setText(d.value);
                  setOutcomes(null);
                }}
              />
            </Field>

            <Body1Strong>Defaults</Body1Strong>
            <Text size={200} className={styles.muted}>
              Used for a column the sheet does not have, or a cell left empty. Raw scale and raw lookback have no built-in default and must come from here or the sheet.
            </Text>
            <div className={styles.defaults}>
              <Field label="Direction">
                <Select value={defaults.direction} onChange={(_, d) => setDefault('direction', d.value as SensorDirection)} disabled={running}>
                  {DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Raw scale">
                <Select value={defaults.rawScale} onChange={(_, d) => setDefault('rawScale', d.value)} disabled={running}>
                  <option value="">(none)</option>
                  {SCALES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Raw lookback">
                <Input type="number" min="1" value={defaults.rawLookback} onChange={(_, d) => setDefault('rawLookback', d.value)} disabled={running} />
              </Field>
              <Field label="Calculate" hint="Off: data is stored and trained on, nothing is calculated.">
                <Select
                  value={defaults.processingEnabled ? 'on' : 'off'}
                  onChange={(_, d) => setDefault('processingEnabled', d.value === 'on')}
                  disabled={running}
                >
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </Select>
              </Field>
              <Field label="Min issue score">
                <Input type="number" min="0" value={defaults.rawMinIssueScore} onChange={(_, d) => setDefault('rawMinIssueScore', d.value)} disabled={running} />
              </Field>
            </div>

            {parsed.fileErrors.map((message) => (
              <MessageBar key={message} intent="error">
                <MessageBarBody>{message}</MessageBarBody>
              </MessageBar>
            ))}
            {parsed.ignoredColumns.length > 0 && (
              <MessageBar intent="warning">
                <MessageBarBody>Ignored column(s) the importer does not know: {parsed.ignoredColumns.join(', ')}.</MessageBarBody>
              </MessageBar>
            )}

            {parsed.rows.length > 0 && !outcomes && (
              <>
                <Text role="status">
                  {parsed.rows.length} row(s): <b>{toCreate.length}</b> will be created
                  {toUpdate.length > 0 && <>, {toUpdate.length} already exist and are updated (only the filled cells)</>}
                  {withProblems.length > 0 && (
                    <>
                      , <b>{withProblems.length} have problems</b> - fix them to import
                    </>
                  )}
                  .
                </Text>
                {withProblems.length > 0 && (
                  <ul className={styles.problems} aria-label="Rows with problems">
                    {withProblems.slice(0, MAX_LISTED).map((r) => (
                      <li key={r.line}>
                        Line {r.line}
                        {r.externalSensorId && ` (${r.externalSensorId})`}:{' '}
                        {r.issues.map((i) => `[${i.field}${i.value ? ` = "${i.value}"` : ''}] ${i.message}`).join(' ')}
                      </li>
                    ))}
                    {withProblems.length > MAX_LISTED && <li>…and {withProblems.length - MAX_LISTED} more.</li>}
                  </ul>
                )}
                <table className={styles.preview} aria-label="Preview of the first rows">
                  <thead>
                    <tr>
                      {['Line', 'Action', 'Sensor name', 'Display name', 'Unit', 'Calculate', 'Setpoint', 'Validation'].map((h) => (
                        <th key={h} className={styles.cell}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, PREVIEW_ROWS).map((r) => (
                      <tr key={r.line}>
                        <td className={styles.cell}>{r.line}</td>
                        <td className={styles.cell}>{r.exists ? 'Update' : 'New'}</td>
                        <td className={styles.cell}>{r.externalSensorId}</td>
                        <td className={styles.cell}>{r.name}</td>
                        <td className={styles.cell}>{unitText(catalog, r.unitCode)}</td>
                        <td className={styles.cell}>{r.exists && !r.provided.processingEnabled ? '—' : r.processingEnabled ? 'on' : 'off'}</td>
                        <td className={styles.cell}>{setpointText(r.setpoint) || '—'}</td>
                        <td className={styles.cell}>{r.errors.length === 0 ? 'OK' : `Error (${r.issues.map((i) => i.field).join(', ')})`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > PREVIEW_ROWS && (
                  <Text size={200} className={styles.muted}>
                    …and {parsed.rows.length - PREVIEW_ROWS} more row(s).
                  </Text>
                )}
              </>
            )}

            {running && progress && (
              <div role="status" aria-live="polite">
                <ProgressBar value={progress.total === 0 ? 0 : progress.done / progress.total} />
                <Text size={200}>
                  Importing Sensors… {progress.done} / {progress.total}
                </Text>
              </div>
            )}

            {outcomes && (
              <div role="status">
                <MessageBar intent={failed.length > 0 ? 'warning' : 'success'}>
                  <MessageBarBody>
                    {created} created
                    {updated.length > 0 && `, ${updated.length} updated`}
                    {unchanged > 0 && `, ${unchanged} already up to date`}
                    {skipped > 0 && `, ${skipped} already existed`}
                    {failed.length > 0 && `, ${failed.length} failed`}.
                    {setpointsSaved > 0 && ` ${setpointsSaved} setpoint(s) recorded, effective from the import.`}
                    {setpointsFailed.length > 0 && ` ${setpointsFailed.length} setpoint(s) could not be saved - those Sensors exist but are not analysed until a setpoint is added on their Policies page.`}
                    {abortRef.current?.signal.aborted && ' The import was stopped before the end.'}
                  </MessageBarBody>
                </MessageBar>
                {updated.length > 0 && (
                  <ul className={styles.problems} aria-label="Updated Sensors">
                    {updated.slice(0, MAX_LISTED).map((o) => (
                      <li key={o.line}>
                        Line {o.line} ({o.externalSensorId}): {(o.changes ?? []).join('; ')}
                      </li>
                    ))}
                    {updated.length > MAX_LISTED && <li>…and {updated.length - MAX_LISTED} more.</li>}
                  </ul>
                )}
                {failed.length > 0 && (
                  <ul className={styles.problems} aria-label="Failed rows">
                    {failed.slice(0, MAX_LISTED).map((o) => (
                      <li key={o.line}>
                        Line {o.line} ({o.externalSensorId}): {o.message}
                      </li>
                    ))}
                  </ul>
                )}
                {setpointsFailed.length > 0 && (
                  <ul className={styles.problems} aria-label="Setpoints not saved">
                    {setpointsFailed.slice(0, MAX_LISTED).map((o) => (
                      <li key={o.line}>
                        Line {o.line} ({o.externalSensorId}): {o.setpointMessage}
                      </li>
                    ))}
                  </ul>
                )}
                <Text size={200} className={styles.muted}>
                  To retry, press Import again - a Sensor that is already up to date is left as it is.
                </Text>
              </div>
            )}
            {importer.isError && <ErrorState error={importer.error} />}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" icon={<ArrowDownload24Regular />} onClick={downloadIdMap} disabled={running || !(outcomes && created + skipped + updated.length + unchanged > 0)}>
              Download Sensor ID map
            </Button>
            {running ? (
              <Button appearance="secondary" onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button appearance="secondary" onClick={close}>
                Close
              </Button>
            )}
            <Button appearance="primary" onClick={start} disabled={!canImport}>
              {toApply.length > 0 ? `Import ${toApply.length} Sensor(s)` : 'Import'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
