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
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, DocumentArrowUp24Regular } from '@fluentui/react-icons';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useSensors } from '@/api/hooks/sensors';
import { fetchDeviceSetpoints, useDeviceSetpoints } from '@/api/hooks/deviceConfiguration';
import { useApplySetpointSync, type SensorSyncOutcome } from '@/api/hooks/setpointSync';
import { downloadTextFile } from '@/lib/downloadFile';
import { DIRECTIONS, type SensorDirection } from '@/lib/sensorImport';
import {
  MAX_SETPOINT_ROWS,
  SETPOINT_SHEET_HEADERS,
  buildSetpointsExportCsv,
  describeValues,
  formatInstant,
  parseSetpointSheet,
  planSetpointSync,
  setpointsExportFileName,
  summarizePlan,
  type ExistingInterval,
  type SheetSensor,
} from '@/lib/setpointSheet';

const useStyles = makeStyles({
  surface: { maxWidth: '960px', width: '96vw' },
  content: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  row: { display: 'flex', gap: tokens.spacingHorizontalM, flexWrap: 'wrap', alignItems: 'center' },
  textarea: { width: '100%', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  list: { maxHeight: '220px', overflowY: 'auto', margin: 0, paddingLeft: tokens.spacingHorizontalXL, fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  problems: { maxHeight: '160px', overflowY: 'auto', margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  muted: { color: tokens.colorNeutralForeground3 },
});

const MAX_LISTED = 15;
const MAX_OPERATION_LINES = 200;

/**
 * "Manage Setpoints" (Admin only): export every Setpoint interval of every Sensor of the Device as one sheet, edit it (Excel), and
 * import the whole sheet back. For every Sensor that appears in the sheet, its stored setpoints become exactly the sheet's rows
 * (rows you removed are deleted, rows you added are created, changed ones are replaced); a Sensor that has only its name left loses
 * all its setpoints; a Sensor that does not appear is not touched. Everything is validated and previewed before the first request.
 * See lib/setpointSheet.ts for the exact rules.
 */
export function ManageSetpointsDialog({ deviceId, open, onClose }: { deviceId: number; open: boolean; onClose: () => void }) {
  const styles = useStyles();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const sensorsQuery = useSensors(deviceId);
  const setpointsQuery = useDeviceSetpoints(deviceId, open);
  const applier = useApplySetpointSync(deviceId);

  const [text, setText] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<SensorSyncOutcome[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const running = applier.isPending;

  const sheetSensors = useMemo<SheetSensor[]>(
    () =>
      (sensorsQuery.data ?? []).flatMap((s) =>
        s.id != null && s.externalSensorId
          ? [{ id: s.id, externalSensorId: s.externalSensorId, direction: ((DIRECTIONS as readonly string[]).includes(s.direction ?? '') ? s.direction : 'lowerisbetter') as SensorDirection }]
          : [],
      ),
    [sensorsQuery.data],
  );
  const stored = useMemo<ExistingInterval[]>(
    () => (setpointsQuery.data ?? []).flatMap((s) => (s.id != null && s.sensorId != null && s.validFrom ? [{ ...s, id: s.id, sensorId: s.sensorId, validFrom: s.validFrom }] : [])),
    [setpointsQuery.data],
  );

  // Parsed on every change of the text; the moment of the import for a single row without validFrom is read when the sheet is parsed.
  const parsed = useMemo(() => parseSetpointSheet(text, sheetSensors, Date.now()), [text, sheetSensors]);
  const plans = useMemo(() => (parsed.issues.length === 0 && parsed.fileErrors.length === 0 ? planSetpointSync(parsed.entries, stored) : []), [parsed, stored]);
  const summary = useMemo(() => summarizePlan(plans), [plans]);
  const removals = summary.deleted + summary.replaced;
  const operations = summary.created + summary.replaced + summary.deleted + summary.replaced; // a replaced interval is a delete AND a create
  const dataReady = sensorsQuery.isSuccess && setpointsQuery.isSuccess && !setpointsQuery.isFetching;
  const hasSheet = text.trim() !== '';
  const canApply = !running && dataReady && hasSheet && parsed.issues.length === 0 && parsed.fileErrors.length === 0 && operations > 0 && (removals === 0 || understood);

  const operationLines = useMemo(() => {
    const lines: string[] = [];
    for (const plan of plans) {
      const name = plan.sensor.externalSensorId;
      for (const { interval, replaced } of plan.remove) {
        lines.push(`DELETE  ${name}  ${interval.validFrom} → ${interval.validTo ?? 'open-ended'}  ${describeValues(interval) || '—'}${replaced ? '  (replaced)' : ''}`);
      }
      for (const { interval, replacement } of plan.create) {
        lines.push(`CREATE  ${name}  ${formatInstant(interval.validFromMs)} → ${interval.validToMs === null ? 'open-ended' : formatInstant(interval.validToMs)}  ${describeValues(interval.values)}${replacement ? '  (replaces)' : ''}`);
      }
    }
    return lines;
  }, [plans]);

  const close = () => {
    if (running) return;
    setText('');
    setUnderstood(false);
    setProgress(null);
    setOutcomes(null);
    setExportError(null);
    applier.reset();
    onClose();
  };

  const exportAll = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const intervals = await fetchDeviceSetpoints(queryClient, deviceId);
      const rows = (intervals ?? []).flatMap((s) => (s.id != null && s.sensorId != null && s.validFrom ? [{ ...s, id: s.id, sensorId: s.sensorId, validFrom: s.validFrom }] : []));
      downloadTextFile(setpointsExportFileName(deviceId), buildSetpointsExportCsv(sheetSensors, rows));
    } catch (e) {
      setExportError(e);
    } finally {
      setExporting(false);
    }
  };

  const start = () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setOutcomes(null);
    setProgress({ done: 0, total: operations });
    applier.mutate(
      { plans, signal: controller.signal, onProgress: (done, total) => setProgress({ done, total }) },
      {
        onSuccess: (result) => {
          setOutcomes(result);
          setUnderstood(false);
          const failed = result.filter((o) => o.failures.length > 0).length;
          const deleted = result.reduce((n, o) => n + o.deleted, 0);
          const created = result.reduce((n, o) => n + o.created, 0);
          if (controller.signal.aborted) toast.info(`Stopped: ${deleted} deleted, ${created} created.`);
          else if (failed > 0) toast.error(`${deleted} deleted, ${created} created, ${failed} Sensor(s) with problems.`);
          else toast.success(`${deleted} deleted, ${created} created.`);
        },
      },
    );
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setOutcomes(null);
    setUnderstood(false);
  };

  const failedOutcomes = outcomes?.filter((o) => o.failures.length > 0) ?? [];

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Manage Setpoints</DialogTitle>
          <DialogContent className={styles.content}>
            <Text size={200} className={styles.muted}>
              Export every setpoint interval of every Sensor of this Device, edit the sheet, and import the whole sheet back. For every Sensor that
              appears in the sheet, its stored setpoints become <b>exactly the rows of the sheet</b>: a row you delete removes that interval, a row you
              add creates one, a changed row replaces its interval (the interval is identified by its <b>validFrom</b>). A Sensor that keeps only its name
              (an empty row) loses <b>all</b> its setpoints. A Sensor that is <b>not in the sheet at all is not touched</b>. Dates are UTC; empty validTo =
              open-ended.
            </Text>

            <div className={styles.row}>
              <Button icon={<ArrowDownload24Regular />} onClick={() => void exportAll()} disabled={exporting || !sensorsQuery.isSuccess}>
                {exporting ? 'Exporting…' : 'Export all setpoints'}
              </Button>
              <Button icon={<DocumentArrowUp24Regular />} onClick={() => fileRef.current?.click()} disabled={running}>
                Choose .csv file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                hidden
                aria-label="Setpoint CSV file"
                onChange={(e) => {
                  void readFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            {exportError !== null && <ErrorState error={exportError} />}

            <Field
              label="Setpoint sheet"
              hint={`Header: ${SETPOINT_SHEET_HEADERS.join(', ')}. Up to ${MAX_SETPOINT_ROWS} rows. Tab-, semicolon- and comma-separated text all work.`}
            >
              <Textarea
                className={styles.textarea}
                resize="vertical"
                rows={8}
                value={text}
                disabled={running}
                placeholder={'sensorName\tvalidFrom\tvalidTo\ttarget\ttolerance\ntemperature_1\t2026-01-01T00:00:00Z\t\t5\t0.5'}
                onChange={(_, d) => {
                  setText(d.value);
                  setOutcomes(null);
                  setUnderstood(false);
                }}
              />
            </Field>

            {(sensorsQuery.isLoading || setpointsQuery.isLoading) && <Text size={200}>Loading the Device&apos;s Sensors and stored setpoints…</Text>}
            {setpointsQuery.isError && <ErrorState error={setpointsQuery.error} onRetry={() => setpointsQuery.refetch()} />}

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
            {parsed.issues.length > 0 && (
              <>
                <Text role="status">
                  <b>{parsed.issues.length} problem(s)</b> - fix them to import; nothing is sent while any exists.
                </Text>
                <ul className={styles.problems} aria-label="Rows with problems">
                  {parsed.issues.slice(0, MAX_LISTED).map((i, n) => (
                    <li key={n}>
                      Line {i.line} [{i.field}
                      {i.value ? ` = "${i.value}"` : ''}]: {i.message}
                    </li>
                  ))}
                  {parsed.issues.length > MAX_LISTED && <li>…and {parsed.issues.length - MAX_LISTED} more.</li>}
                </ul>
              </>
            )}

            {hasSheet && parsed.issues.length === 0 && parsed.fileErrors.length === 0 && dataReady && !outcomes && (
              <>
                <Text role="status">
                  {`${summary.sensorsInSheet} Sensor(s) in the sheet, ${summary.sensorsChanged} would change: ${summary.created} interval(s) created, ${summary.replaced} replaced, ${summary.deleted} deleted, ${summary.unchanged} already as in the sheet. ${sheetSensors.length - summary.sensorsInSheet} other Sensor(s) of this Device are not in the sheet and are not touched.`}
                </Text>
                {operationLines.length > 0 && (
                  <>
                    <Body1Strong>What will be done</Body1Strong>
                    <ul className={styles.list} aria-label="Planned changes">
                      {operationLines.slice(0, MAX_OPERATION_LINES).map((line, n) => (
                        <li key={n}>{line}</li>
                      ))}
                      {operationLines.length > MAX_OPERATION_LINES && <li>…and {operationLines.length - MAX_OPERATION_LINES} more.</li>}
                    </ul>
                  </>
                )}
                {removals > 0 && (
                  <Checkbox
                    checked={understood}
                    onChange={(_, d) => setUnderstood(!!d.checked)}
                    label={`I understand that ${removals} stored setpoint interval(s) will be permanently deleted${summary.replaced > 0 ? ` (${summary.replaced} of them are created again with the sheet's values)` : ''}.`}
                  />
                )}
                {removals > 0 && (
                  <Text size={200} className={styles.muted}>
                    A Sensor without an effective setpoint is not analysed for that time. Issues already found are not changed; no retraining is scheduled.
                  </Text>
                )}
              </>
            )}

            {running && progress && (
              <div role="status" aria-live="polite">
                <ProgressBar value={progress.total === 0 ? 0 : progress.done / progress.total} />
                <Text size={200}>
                  Applying… {progress.done} / {progress.total}
                </Text>
              </div>
            )}

            {outcomes && (
              <div role="status">
                <MessageBar intent={failedOutcomes.length > 0 ? 'warning' : 'success'}>
                  <MessageBarBody>
                    {outcomes.reduce((n, o) => n + o.deleted, 0)} deleted, {outcomes.reduce((n, o) => n + o.created, 0)} created
                    {failedOutcomes.length > 0 && `, ${failedOutcomes.length} Sensor(s) with problems`}.
                    {abortRef.current?.signal.aborted && ' The run was stopped before the end.'} Importing the same sheet again finishes whatever did not go through.
                  </MessageBarBody>
                </MessageBar>
                {failedOutcomes.length > 0 && (
                  <ul className={styles.problems} aria-label="Sensors with problems">
                    {failedOutcomes.slice(0, MAX_LISTED).map((o) => (
                      <li key={o.sensorName}>
                        {o.sensorName}: {o.failures.join(' ')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {applier.isError && <ErrorState error={applier.error} />}
          </DialogContent>
          <DialogActions>
            {running ? (
              <Button appearance="secondary" onClick={() => abortRef.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button appearance="secondary" onClick={close}>
                Close
              </Button>
            )}
            <Button appearance="primary" onClick={start} disabled={!canApply}>
              {operations > 0 && parsed.issues.length === 0 ? `Apply ${operations} change(s)` : 'Apply'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
