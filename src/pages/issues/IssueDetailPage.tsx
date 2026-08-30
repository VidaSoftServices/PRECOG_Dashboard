import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card,
  Text,
  Body1Strong,
  Button,
  Select,
  Badge,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ChatSparkle24Regular, ArrowUndo24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { ReviewStatePill } from '@/components/StatusPill';
import { TelemetryChart } from '@/components/charts/TelemetryChart';
import { MoveToCanonicalDialog } from '@/components/MoveToCanonicalDialog';
import { useAppToast } from '@/components/ToastProvider';
import {
  useIssue,
  useIssueGroup,
  useReviewIssue,
  useReopenIssue,
  useAssignIssueCategory,
  useUngroupIssue,
  useMoveGroupMember,
  useReassignCanonical,
} from '@/api/hooks/issues';
import { useIssueCategories } from '@/api/hooks/issueCategories';
import { useIssueCategorySuggestion, useRequestCategorySuggestion, useDecideCategorySuggestion } from '@/api/hooks/issueCategorySuggestion';
import { useDevice } from '@/api/hooks/devices';
import { useSensors } from '@/api/hooks/sensors';
import { useTelemetryPeriodRange, familyFor } from '@/api/hooks/telemetry';
import { useSubmitOllamaSummaryJob, useOllamaJob } from '@/api/hooks/ollama';
import { JobStatusPill } from '@/components/StatusPill';
import { formatDateTime } from '@/lib/dateTime';
import { useAuth } from '@/auth/AuthContext';
import { activateProps } from '@/lib/useActivateProps';
import type { IssueReviewState } from '@/api/domainTypes';

const useStyles = makeStyles({
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 320px',
    gap: tokens.spacingHorizontalL,
  },
  card: {
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM,
  },
  reviewButtons: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
});

const reviewOptions: { state: IssueReviewState; label: string; appearance: 'primary' | 'secondary' }[] = [
  { state: 'ReviewedFault', label: 'Confirm fault', appearance: 'primary' },
  { state: 'ReviewedFalsePositive', label: 'Mark false positive', appearance: 'secondary' },
];

interface GroupMemberDto {
  id?: number;
  measuredAtFrom?: string;
  reviewState?: string | null;
}

/** Each row owns its own Move/Reassign mutation state - simpler than lifting per-row mutation state into the parent for a list this small. */
function GroupMemberRow({
  deviceId,
  canonicalId,
  member,
}: {
  deviceId: number;
  canonicalId: number;
  member: GroupMemberDto;
}) {
  const navigate = useNavigate();
  const moveMember = useMoveGroupMember(deviceId, member.id ?? -1);
  const reassign = useReassignCanonical(deviceId, canonicalId);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const toast = useAppToast();

  return (
    <div style={{ padding: `${tokens.spacingVerticalXS} 0`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ cursor: 'pointer' }} {...activateProps(() => navigate(`/issues/${member.id}`))}>
          <Text size={200}>{formatDateTime(member.measuredAtFrom)}</Text>
        </div>
        <ReviewStatePill reviewState={member.reviewState} />
      </div>
      <div style={{ display: 'flex', gap: tokens.spacingHorizontalXS, marginTop: tokens.spacingVerticalXXS }}>
        <Button
          size="small"
          appearance="subtle"
          onClick={() =>
            reassign.mutate(
              { newCanonicalIssueId: member.id! },
              { onSuccess: () => toast.success('Canonical Issue reassigned') },
            )
          }
          disabled={reassign.isPending}
        >
          Make canonical
        </Button>
        <Button size="small" appearance="subtle" onClick={() => setMoveDialogOpen(true)} disabled={moveMember.isPending}>
          Move to another group
        </Button>
      </div>
      {(moveMember.isError || reassign.isError) && <ErrorState error={moveMember.error ?? reassign.error} />}
      <MoveToCanonicalDialog
        open={moveDialogOpen}
        deviceId={deviceId}
        memberIssueId={member.id!}
        currentCanonicalId={canonicalId}
        busy={moveMember.isPending}
        error={moveMember.error}
        onConfirm={(targetCanonicalIssueId) =>
          moveMember.mutate(
            { newCanonicalIssueId: targetCanonicalIssueId },
            {
              onSuccess: () => {
                setMoveDialogOpen(false);
                toast.success('Issue moved to the new group');
              },
            },
          )
        }
        onCancel={() => setMoveDialogOpen(false)}
      />
    </div>
  );
}

function OllamaSummary({ issueId }: { issueId: number }) {
  const toast = useAppToast();
  const submit = useSubmitOllamaSummaryJob();
  const jobQuery = useOllamaJob(submit.data?.id);
  const notifiedStatusRef = useRef<string | null>(null);

  // Toast once per terminal transition, not on every poll tick. Checks the
  // real "Succeeded" value (see domainTypes.ts's OllamaJobStatus comment) -
  // both the OpenAPI text and the integration guide say "Completed", which
  // never actually occurs on the wire.
  useEffect(() => {
    const status = jobQuery.data?.status;
    if (!status || notifiedStatusRef.current === status) return;
    if (status === 'Succeeded') {
      notifiedStatusRef.current = status;
      toast.success('Ollama summary ready');
    } else if (status === 'Failed') {
      notifiedStatusRef.current = status;
      toast.error('Ollama summary failed');
    } else if (status === 'Cancelled') {
      notifiedStatusRef.current = status;
      toast.info('Ollama job cancelled');
    }
  }, [jobQuery.data?.status, toast]);

  return (
    <div>
      <Button
        icon={<ChatSparkle24Regular />}
        onClick={() => submit.mutate(issueId, { onSuccess: () => toast.info('Ollama summary requested') })}
        disabled={submit.isPending}
      >
        {submit.isPending ? 'Requesting…' : 'Ask Ollama for a summary'}
      </Button>
      {submit.isError && <ErrorState error={submit.error} />}
      {jobQuery.data && (
        <div style={{ marginTop: tokens.spacingVerticalS }}>
          <JobStatusPill status={jobQuery.data.status} />
          {jobQuery.data.resultText && (
            <Text style={{ display: 'block', marginTop: tokens.spacingVerticalXS, whiteSpace: 'pre-wrap' }}>
              {jobQuery.data.resultText}
            </Text>
          )}
          {jobQuery.data.errorMessage && <ErrorState error={new Error(jobQuery.data.errorMessage)} />}
        </div>
      )}
    </div>
  );
}

export function IssueDetailPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useAppToast();
  const { issueId } = useParams<{ issueId: string }>();
  const id = Number(issueId);

  const issueQuery = useIssue(id);
  const groupQuery = useIssueGroup(id);
  const deviceQuery = useDevice(issueQuery.data?.deviceId);
  const sensorsQuery = useSensors(issueQuery.data?.deviceId);
  const categoriesQuery = useIssueCategories();
  const suggestionQuery = useIssueCategorySuggestion(id);

  const reviewIssue = useReviewIssue(issueQuery.data?.deviceId ?? -1, id);
  const reopenIssue = useReopenIssue(issueQuery.data?.deviceId ?? -1);
  const assignCategory = useAssignIssueCategory(issueQuery.data?.deviceId ?? -1, id);
  const ungroup = useUngroupIssue(issueQuery.data?.deviceId ?? -1);
  const requestSuggestion = useRequestCategorySuggestion(id);
  const decideSuggestion = useDecideCategorySuggestion(id);

  const primarySensorId = issueQuery.data?.primarySensorId ?? issueQuery.data?.sensorIds?.[0];
  const primarySensor = sensorsQuery.data?.find((s) => s.id === primarySensorId);
  const family = familyFor((deviceQuery.data?.applicationMode as 'continuous' | 'periodic') ?? 'continuous', primarySensor?.direction);
  const periodChart = useTelemetryPeriodRange({
    family,
    deviceId: issueQuery.data?.deviceId,
    sensorId: primarySensorId,
    periodFrom: issueQuery.data?.periodFrom ?? 0,
    periodTo: issueQuery.data?.periodTo ?? 0,
  });

  if (issueQuery.isLoading) return <LoadingState label="Loading issue…" />;
  if (issueQuery.isError) return <ErrorState error={issueQuery.error} onRetry={() => issueQuery.refetch()} />;
  const issue = issueQuery.data;
  if (!issue) return null;

  return (
    <>
      <PageHeader
        title={`Issue #${issue.issueKey}`}
        description={`${formatDateTime(issue.measuredAtFrom)} → ${formatDateTime(issue.measuredAtTo)}`}
        actions={
          issue.reviewState !== 'PendingReview' &&
          isAdmin && (
            <Button
              icon={<ArrowUndo24Regular />}
              onClick={() => reopenIssue.mutate(id, { onSuccess: () => toast.success('Issue reopened for review') })}
              disabled={reopenIssue.isPending}
            >
              {reopenIssue.isPending ? 'Reopening…' : 'Reopen for review'}
            </Button>
          )
        }
      />

      <div className={styles.layout}>
        <div>
          <Card className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <ReviewStatePill reviewState={issue.reviewState} />
              {!issue.isCanonical && <Badge appearance="outline">member of canonical #{issue.canonicalIssueId}</Badge>}
            </div>
            {issue.message && <Text>{issue.message}</Text>}

            {isAdmin && issue.reviewState === 'PendingReview' && (
              <div className={styles.reviewButtons}>
                {reviewOptions.map((opt) => (
                  <Button
                    key={opt.state}
                    appearance={opt.appearance}
                    disabled={reviewIssue.isPending}
                    onClick={() =>
                      reviewIssue.mutate(
                        { reviewState: opt.state },
                        {
                          onSuccess: (result) => {
                            // Real feedback from the response, not a guess -
                            // IssueReviewResultDto reports exactly whether
                            // this coalesced into an existing Pending
                            // request or started a new one.
                            if (result.trainingRequestId) {
                              toast.success(
                                result.coalesced
                                  ? 'Review saved - coalesced into the pending retraining request'
                                  : 'Review saved - retraining scheduled',
                              );
                            } else {
                              toast.success('Review saved');
                            }
                          },
                        },
                      )
                    }
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}
            {reviewIssue.isError && <ErrorState error={reviewIssue.error} />}
          </Card>

          <Card className={styles.card}>
            <Body1Strong>Telemetry</Body1Strong>
            {periodChart.isLoading && <LoadingState label="" />}
            {periodChart.isError && <ErrorState error={periodChart.error} />}
            {periodChart.data && (
              <TelemetryChart
                series={[{ label: primarySensor?.name || 'Sensor', points: periodChart.data, bidirectional: primarySensor?.direction === 'bidirectional' }]}
                mode="single"
                showControlLimits
                height={280}
              />
            )}
          </Card>

          {groupQuery.data && groupQuery.data.members && groupQuery.data.members.length > 0 && (
            <Card className={styles.card}>
              <Body1Strong>Grouped members ({groupQuery.data.members.length})</Body1Strong>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                Nothing here is ever deleted - moving or reassigning only changes which Issue is the group's canonical representative.
              </Text>
              {groupQuery.data.members.map((member) =>
                isAdmin ? (
                  <GroupMemberRow
                    key={member.id}
                    deviceId={issue.deviceId!}
                    canonicalId={(issue.isCanonical ? issue.id : issue.canonicalIssueId)!}
                    member={member}
                  />
                ) : (
                  <div
                    key={member.id}
                    style={{ display: 'flex', justifyContent: 'space-between', padding: `${tokens.spacingVerticalXS} 0`, cursor: 'pointer' }}
                    {...activateProps(() => navigate(`/issues/${member.id}`))}
                  >
                    <Text size={200}>{formatDateTime(member.measuredAtFrom)}</Text>
                    <ReviewStatePill reviewState={member.reviewState} />
                  </div>
                ),
              )}
            </Card>
          )}

          {isAdmin && !issue.isCanonical && (
            <Button
              appearance="secondary"
              onClick={() => ungroup.mutate(id, { onSuccess: () => toast.success('Issue ungrouped - now canonical for itself') })}
              disabled={ungroup.isPending}
            >
              Ungroup from canonical Issue
            </Button>
          )}
        </div>

        <div>
          <Card className={styles.card}>
            <Body1Strong>Category</Body1Strong>
            {categoriesQuery.isLoading && <LoadingState label="" />}
            {isAdmin && issue.isCanonical ? (
              <Select
                value={issue.issueCategoryId !== undefined && issue.issueCategoryId !== null ? String(issue.issueCategoryId) : ''}
                onChange={(_, d) =>
                  assignCategory.mutate(
                    { issueCategoryId: d.value ? Number(d.value) : null },
                    { onSuccess: () => toast.success(d.value ? 'Category assigned' : 'Category cleared') },
                  )
                }
              >
                <option value="">Uncategorized</option>
                {categoriesQuery.data?.filter((c) => c.enabled).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Text>{issue.issueCategoryName ?? 'Uncategorized'}</Text>
            )}
            {!issue.isCanonical && (
              <MessageBar intent="info">
                <MessageBarBody>Category can only be set on the canonical Issue.</MessageBarBody>
              </MessageBar>
            )}
          </Card>

          {isAdmin && issue.isCanonical && (
            <Card className={styles.card}>
              <Body1Strong>Category suggestion</Body1Strong>
              {suggestionQuery.data === null && (
                <Button
                  onClick={() => requestSuggestion.mutate(undefined, { onSuccess: () => toast.info('Category suggestion requested') })}
                  disabled={requestSuggestion.isPending}
                >
                  {requestSuggestion.isPending ? 'Requesting…' : 'Ask Ollama to suggest a category'}
                </Button>
              )}
              {suggestionQuery.data && (
                <>
                  <Text size={200}>{suggestionQuery.data.status}</Text>
                  {suggestionQuery.data.suggestedText && <Text weight="semibold">{suggestionQuery.data.suggestedText}</Text>}
                  {suggestionQuery.data.status === 'Suggested' && (
                    <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
                      <Button
                        size="small"
                        onClick={() =>
                          decideSuggestion.mutate(
                            { accept: true, createFromSuggestion: true },
                            { onSuccess: () => toast.success('Category suggestion accepted') },
                          )
                        }
                        disabled={decideSuggestion.isPending}
                      >
                        Accept
                      </Button>
                      <Button
                        size="small"
                        appearance="secondary"
                        onClick={() => decideSuggestion.mutate({ accept: false }, { onSuccess: () => toast.info('Category suggestion rejected') })}
                        disabled={decideSuggestion.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          <Card className={styles.card}>
            <Body1Strong>Ollama summary</Body1Strong>
            <OllamaSummary issueId={id} />
          </Card>
        </div>
      </div>
    </>
  );
}
