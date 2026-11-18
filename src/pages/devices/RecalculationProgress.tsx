import { useEffect, useRef, useState } from 'react';
import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, ProgressBar, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { ACTIVE_RECALCULATION_PHASES, useCancelRecalculation, useRecalculationStatus, type RecalculationStatusDto } from '@/api/hooks/recalculation';
import { queryKeys } from '@/api/queryKeys';
import { formatDateTimeWithZone } from '@/lib/dateTime';

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
 * What the job does, from its Sensors' kinds (Recalculate | DeleteOnly | CatchUp): a catch-up (calculation switched on) calculates what was
 * not calculated yet, a delete-only run (Recalc with calculation off) only deletes. Mixed or unknown reads as a recalculation.
 */
function jobKind(data: RecalculationStatusDto): 'Recalculate' | 'DeleteOnly' | 'CatchUp' {
  const kinds = new Set((data.sensors ?? []).filter((s) => s.phase !== 'Skipped').map((s) => s.kind ?? 'Recalculate'));
  if (kinds.size === 1 && kinds.has('CatchUp')) return 'CatchUp';
  if (kinds.size === 1 && kinds.has('DeleteOnly')) return 'DeleteOnly';
  return 'Recalculate';
}

const RUNNING_TITLE = { Recalculate: 'Recalculating from the start', DeleteOnly: 'Deleting the calculated values', CatchUp: 'Calculating the values not calculated yet' };
const FINISHED_TITLE = { Recalculate: 'Recalculation finished', DeleteOnly: 'Calculated values deleted', CatchUp: 'Calculation caught up' };

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
      queryClient.invalidateQueries({ queryKey: queryKeys.calculatedUpTo(deviceId) });
      if (data.status === 'Completed') toast.success(`${FINISHED_TITLE[jobKind(data)]}.`);
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
            <MessageBarTitle>
              {RUNNING_TITLE[jobKind(data)]}: {percent.toFixed(1)} %
            </MessageBarTitle>
            {jobKind(data) === 'DeleteOnly'
              ? `${(data.doneReadings ?? 0).toLocaleString()} of ${(data.totalReadings ?? 0).toLocaleString()} Sensor(s)`
              : `${(data.doneReadings ?? 0).toLocaleString()} of ${(data.totalReadings ?? 0).toLocaleString()} values`}
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
  const levelsReset = (data.sensors ?? []).reduce((n, s) => n + (s.aggregationLevelsReset ?? 0), 0);
  const deleteOnly = (data.sensors ?? []).filter((s) => s.kind === 'DeleteOnly' && s.phase === 'Done').length;
  const kind = jobKind(data);
  const intent = data.status === 'Completed' ? 'success' : 'warning';
  let title = 'Recalculation ended with errors';
  if (data.status === 'Completed') title = FINISHED_TITLE[kind];
  else if (data.status === 'Cancelled') title = 'Recalculation stopped';
  return (
    <div className={styles.box}>
      <MessageBar intent={intent}>
        <MessageBarBody>
          <MessageBarTitle>{title}</MessageBarTitle>
          {kind === 'DeleteOnly'
            ? `${deletedIssues} unreviewed Issue(s) deleted, ${keptIssues} reviewed Issue(s) kept; nothing was calculated (calculation is switched off).`
            : `${(data.doneReadings ?? 0).toLocaleString()} of ${(data.totalReadings ?? 0).toLocaleString()} values evaluated; ${deletedIssues} unreviewed Issue(s) replaced, ${keptIssues} reviewed Issue(s) kept.`}
          {kind === 'Recalculate' && deleteOnly > 0 && ` ${deleteOnly} Sensor(s) with calculation off were only deleted from.`}
          {levelsReset > 0 && ` ${levelsReset} aggregation level(s) are being aggregated again in the background.`}
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

/**
 * Under a Sensor's name: the measurement time of its newest calculated value ("Calculated up to ..."), so for a Sensor whose calculation is switched
 * off the Admin sees where it stopped, and after a Recalc where the recalculation has got. It is where the calculation STANDS, not a completeness
 * percentage (a gap in the middle is invisible; counting readings is too expensive on the real database). Nothing is shown until the first answer.
 */
export function CalculatedUpToNote({ calculatedUpTo, loaded }: { calculatedUpTo: string | null | undefined; loaded: boolean }) {
  if (!loaded) return null;
  return (
    <Text size={200} block style={{ color: tokens.colorNeutralForeground3 }}>
      {calculatedUpTo ? `Calculated up to: ${formatDateTimeWithZone(calculatedUpTo)}` : 'Nothing calculated'}
    </Text>
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
  const catchUp = entry.kind === 'CatchUp';
  let text = 'Waiting for its turn: 0 %';
  if (entry.phase === 'Done' && entry.kind === 'DeleteOnly') text = 'Calculated values deleted (calculation off)';
  else if (entry.phase === 'Done') text = catchUp ? 'Caught up: 100 %' : 'Recalculated: 100 %';
  else if (working && entry.kind === 'DeleteOnly') text = 'Deleting the calculated values';
  else if (working) text = `${catchUp ? 'Catching up' : 'Recalculating'}: ${percent} % (${done.toLocaleString()} / ${total.toLocaleString()})`;
  return (
    <div style={{ marginTop: tokens.spacingVerticalXXS, maxWidth: '260px' }}>
      <Text size={200} block style={{ color: tokens.colorBrandForeground1 }}>
        {text}
      </Text>
      <ProgressBar value={percent / 100} thickness="medium" aria-label={`Recalculation progress of ${entry.name ?? 'the Sensor'}`} />
    </div>
  );
}
