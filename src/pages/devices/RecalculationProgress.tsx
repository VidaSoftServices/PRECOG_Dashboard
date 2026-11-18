import { useEffect, useRef, useState } from 'react';
import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, ProgressBar, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { ACTIVE_RECALCULATION_PHASES, useCancelRecalculation, useRecalculationStatus, type RecalculationStatusDto } from '@/api/hooks/recalculation';
import { queryKeys } from '@/api/queryKeys';

const useStyles = makeStyles({
  box: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, marginBottom: tokens.spacingVerticalM },
});

/** A finished job is shown for this long after it ended (so a page opened later does not show an hours-old result for ever). */
const FINISHED_VISIBLE_MS = 10 * 60 * 1000;

const PHASE_TEXT: Record<string, string> = {
  Deleting: 'deleting the old results',
  ControlLimits: 'calculating the control limits',
  Analysing: 'evaluating the values one by one',
};

/**
 * The percentage of the Device's recalculation (polled while it runs) with a Stop button for an Admin, and a short result when it ends.
 * When a run finishes while the page is open, everything it rewrote (the Sensor list, Issues, telemetry) is refetched. Renders nothing
 * when no recalculation exists (the job lives in the API's memory and a restart forgets it).
 */
export function RecalculationProgress({ deviceId, isAdmin }: { deviceId: number; isAdmin: boolean }) {
  const styles = useStyles();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const status = useRecalculationStatus(deviceId);
  const cancel = useCancelRecalculation(deviceId);
  const [dismissedJobId, setDismissedJobId] = useState<string | null>(null);
  const wasActive = useRef(false);

  const data = status.data;
  const active = data?.active === true;

  useEffect(() => {
    if (wasActive.current && data && !data.active) {
      queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      if (data.status === 'Completed') toast.success('Recalculation finished.');
      else if (data.status === 'Cancelled') toast.info('Recalculation stopped.');
      else toast.error('Recalculation ended with errors; see the Device page.');
    }
    wasActive.current = active;
  }, [active, data, deviceId, queryClient, toast]);

  if (!data?.exists) return null;

  if (active) {
    const percent = Math.max(0, Math.min(100, data.percent ?? 0));
    const phase = data.currentPhase ? PHASE_TEXT[data.currentPhase] ?? data.currentPhase : 'waiting';
    return (
      <div className={styles.box} role="status" aria-live="polite">
        <MessageBar intent="info">
          <MessageBarBody>
            <MessageBarTitle>Recalculating from the start: {percent.toFixed(1)} %</MessageBarTitle>
            {(data.doneReadings ?? 0).toLocaleString()} of {(data.totalReadings ?? 0).toLocaleString()} values
            {data.currentSensorName ? ` — ${data.currentSensorName}: ${phase}` : ''}
            {` (${data.sensorsFinished ?? 0} of ${data.sensorsTotal ?? 0} Sensor(s) finished)`}
          </MessageBarBody>
          {isAdmin && (
            <MessageBarActions>
              <Button size="small" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                Stop
              </Button>
            </MessageBarActions>
          )}
        </MessageBar>
        <ProgressBar value={percent / 100} aria-label="Recalculation progress" />
        {cancel.isError && <ErrorState error={cancel.error} />}
      </div>
    );
  }

  const finishedAt = data.finishedAt ? new Date(data.finishedAt).getTime() : 0;
  if (!data.jobId || data.jobId === dismissedJobId || Date.now() - finishedAt > FINISHED_VISIBLE_MS) return null;

  const failed = (data.sensors ?? []).filter((s) => s.phase === 'Failed');
  const skipped = (data.sensors ?? []).filter((s) => s.phase === 'Skipped');
  const deletedIssues = (data.sensors ?? []).reduce((n, s) => n + (s.issuesDeleted ?? 0), 0);
  const keptIssues = (data.sensors ?? []).reduce((n, s) => n + (s.reviewedIssuesKept ?? 0), 0);
  const intent = data.status === 'Completed' ? 'success' : 'warning';
  return (
    <div className={styles.box}>
      <MessageBar intent={intent}>
        <MessageBarBody>
          <MessageBarTitle>
            {data.status === 'Completed' ? 'Recalculation finished' : data.status === 'Cancelled' ? 'Recalculation stopped' : 'Recalculation ended with errors'}
          </MessageBarTitle>
          {(data.doneReadings ?? 0).toLocaleString()} of {(data.totalReadings ?? 0).toLocaleString()} values evaluated; {deletedIssues} unreviewed Issue(s) replaced,{' '}
          {keptIssues} reviewed Issue(s) kept.
          {skipped.length > 0 && <Text block>Left out: {skipped.map((s) => `${s.name} (${s.note})`).join('; ')}</Text>}
          {failed.length > 0 && <Text block>Not finished: {failed.map((s) => `${s.name} (${s.note})`).join('; ')}</Text>}
          {data.error && <Text block>{data.error}</Text>}
        </MessageBarBody>
        <MessageBarActions>
          <Button size="small" onClick={() => setDismissedJobId(data.jobId ?? null)}>
            Dismiss
          </Button>
        </MessageBarActions>
      </MessageBar>
    </div>
  );
}

/** A finished run's per-Sensor figures are shown this long after it ended (like the summary bar), then the rows go quiet again. */
const RECALC_RESULT_VISIBLE_MS = 10 * 60 * 1000;

/**
 * THIS Sensor's own recalculation progress, under its name: a percentage (readings evaluated / its readings) with a small bar - 0 % while it waits for its
 * turn, the live percentage while it is worked on (re-read every 5 seconds), 100 % when done, or why it was skipped / failed. Shown while the run is
 * active and for a few minutes after it ended; a Sensor that is not part of the run shows nothing.
 */
export function SensorRecalculationNote({ status, sensorId }: { status: RecalculationStatusDto | undefined; sensorId: number | undefined }) {
  if (!status?.exists || sensorId === undefined) return null;
  const finishedAt = status.finishedAt ? new Date(status.finishedAt).getTime() : 0;
  if (!status.active && Date.now() - finishedAt > RECALC_RESULT_VISIBLE_MS) return null;
  const entry = (status.sensors ?? []).find((s) => s.sensorId === sensorId);
  if (!entry) return null;
  if (entry.phase === 'Skipped' || entry.phase === 'Failed') {
    return (
      <Text size={200} block style={{ color: tokens.colorPaletteRedForeground1 }}>
        {entry.phase === 'Skipped' ? 'Not recalculated' : 'Recalculation not finished'}
        {entry.note ? `: ${entry.note}` : ''}
      </Text>
    );
  }
  const total = entry.totalReadings ?? 0;
  const done = entry.phase === 'Done' ? total : Math.min(entry.doneReadings ?? 0, total);
  const percent = entry.phase === 'Done' ? 100 : total > 0 ? Math.floor((100 * done) / total) : 0;
  const working = ACTIVE_RECALCULATION_PHASES.includes(entry.phase ?? '');
  const text =
    entry.phase === 'Done'
      ? 'Recalculated: 100 %'
      : working
        ? `Recalculating: ${percent} % (${done.toLocaleString()} / ${total.toLocaleString()})`
        : 'Waiting for its turn: 0 %';
  return (
    <div style={{ marginTop: tokens.spacingVerticalXXS, maxWidth: '260px' }}>
      <Text size={200} block style={{ color: tokens.colorBrandForeground1 }}>
        {text}
      </Text>
      <ProgressBar value={percent / 100} thickness="medium" aria-label={`Recalculation progress of ${entry.name ?? 'the Sensor'}`} />
    </div>
  );
}
