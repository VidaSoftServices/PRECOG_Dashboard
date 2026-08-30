import { useEffect, useRef } from 'react';
import { Card, Text, Body1Strong, Button, Input, Field, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components';
import { DismissCircle24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { JobStatusPill } from '@/components/StatusPill';
import { useAppToast } from '@/components/ToastProvider';
import { useOllamaJob, useCancelOllamaJob } from '@/api/hooks/ollama';
import { useNumberSearchParam } from '@/lib/useNumberSearchParam';
import { formatDateTimeWithZone } from '@/lib/dateTime';

const useStyles = makeStyles({
  card: { padding: tokens.spacingVerticalM, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

export function OllamaJobsPage() {
  const styles = useStyles();
  const toast = useAppToast();
  const [jobId, setJobId] = useNumberSearchParam('jobId');
  const jobQuery = useOllamaJob(jobId);
  const cancelJob = useCancelOllamaJob(jobId ?? -1);
  const notifiedStatusRef = useRef<string | null>(null);

  // Terminal-status toast, once per transition - checks the real
  // "Succeeded" value (both the OpenAPI text and the integration guide say
  // "Completed", which never actually occurs on the wire; see domainTypes.ts).
  useEffect(() => {
    const status = jobQuery.data?.status;
    if (!status || notifiedStatusRef.current === status) return;
    if (status === 'Succeeded') {
      notifiedStatusRef.current = status;
      toast.success('Ollama job succeeded');
    } else if (status === 'Failed') {
      notifiedStatusRef.current = status;
      toast.error('Ollama job failed');
    }
  }, [jobQuery.data?.status, toast]);

  return (
    <>
      <PageHeader title="Ollama Jobs" description="Ollama job summary requests are submitted from an Issue's detail page and tracked here by id." />

      <MessageBar intent="info" style={{ marginBottom: tokens.spacingVerticalM }}>
        <MessageBarBody>
          The API has no endpoint to list Ollama jobs - only submit, get-by-id, and cancel. This is a documented
          backend gap; look up a specific job by id (or follow a link from an Issue) rather than expecting a full
          history here.
        </MessageBarBody>
      </MessageBar>

      <Card className={styles.card} style={{ maxWidth: '420px', marginBottom: tokens.spacingVerticalL }}>
        <Field label="Job ID">
          <Input type="number" value={jobId !== undefined ? String(jobId) : ''} onChange={(_, d) => setJobId(d.value ? Number(d.value) : undefined)} />
        </Field>
      </Card>

      {jobId !== undefined && jobQuery.isLoading && <LoadingState label="Loading job…" />}
      {jobId !== undefined && jobQuery.isError && <ErrorState error={jobQuery.error} onRetry={() => jobQuery.refetch()} />}

      {jobQuery.data && (
        <Card className={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Body1Strong>Job #{jobQuery.data.id}</Body1Strong>
            <JobStatusPill status={jobQuery.data.status} />
          </div>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Created {formatDateTimeWithZone(jobQuery.data.createdAt)} · Requested by {jobQuery.data.actorType}
          </Text>
          {jobQuery.data.correlationId && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Correlation ID (safe to share with support): <code>{jobQuery.data.correlationId}</code>
            </Text>
          )}
          {jobQuery.data.resultText && <Text style={{ whiteSpace: 'pre-wrap' }}>{jobQuery.data.resultText}</Text>}
          {jobQuery.data.errorMessage && <ErrorState error={new Error(jobQuery.data.errorMessage)} />}
          {jobQuery.data.status === 'Queued' && (
            <Button
              icon={<DismissCircle24Regular />}
              appearance="secondary"
              onClick={() => cancelJob.mutate(undefined, { onSuccess: () => toast.info('Ollama job cancelled') })}
              disabled={cancelJob.isPending}
            >
              {cancelJob.isPending ? 'Cancelling…' : 'Cancel'}
            </Button>
          )}
        </Card>
      )}
    </>
  );
}
