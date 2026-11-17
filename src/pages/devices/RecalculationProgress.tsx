import { useEffect, useRef, useState } from 'react';
import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, ProgressBar, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '@/components/states/ErrorState';
import { useAppToast } from '@/components/ToastProvider';
import { useCancelRecalculation, useRecalculationStatus } from '@/api/hooks/recalculation';
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
