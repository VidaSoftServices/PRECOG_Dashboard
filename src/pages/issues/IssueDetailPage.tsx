import { useEffect, useMemo, useRef, useState } from 'react';
import { useMaintenanceHistory } from '@/api/hooks/maintenance';
import { maintenanceMarkers } from '@/lib/maintenanceMarkers';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card,
  Text,
  Body1Strong,
  Button,
  Select,
  Textarea,
  Field,
  Badge,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ChatSparkle24Regular, ArrowUndo24Regular, Delete24Regular } from '@fluentui/react-icons';
import { DeleteIssueDialog } from './DeleteIssueDialog';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmailSentPill, ReviewStatePill } from '@/components/StatusPill';
import { emailSentText } from '@/lib/issueEmail';
import { EnlargeableTelemetryChart } from '@/components/charts/EnlargeableTelemetryChart';
import { MoveToCanonicalDialog } from '@/components/MoveToCanonicalDialog';
import { useAppToast } from '@/components/ToastProvider';
import {
  useIssue,
  useIssueGroup,
  useReviewIssue,
  useUpdateIssue,
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
import { useLanguage, useT } from '@/lib/language';
import { localizedIssueMessage, type IssueMessages } from '@/lib/issueMessage';

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
  const t = useT();
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
              { onSuccess: () => toast.success(t('Canonical Issue reassigned')) },
            )
          }
          disabled={reassign.isPending}
        >
          {t('Make canonical')}</Button>
        <Button size="small" appearance="subtle" onClick={() => setMoveDialogOpen(true)} disabled={moveMember.isPending}>
          {t('Move to another group')}</Button>
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
                toast.success(t('Issue moved to the new group'));
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
  const t = useT();
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
      toast.success(t('Ollama summary ready'));
    } else if (status === 'Failed') {
      notifiedStatusRef.current = status;
      toast.error(t('Ollama summary failed'));
    } else if (status === 'Cancelled') {
      notifiedStatusRef.current = status;
      toast.info(t('Ollama job cancelled'));
    }
  }, [jobQuery.data?.status, toast]);

  return (
    <div>
      <Button
        icon={<ChatSparkle24Regular />}
        onClick={() => submit.mutate(issueId, { onSuccess: () => toast.info(t('Ollama summary requested')) })}
        disabled={submit.isPending}
      >
        {submit.isPending ? t('Requesting…') : t('Ask Ollama for a summary')}
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

/** The Issue.Message column length (the API does not validate it, the database refuses a longer text). */
const MAX_FEEDBACK_LENGTH = 440;

/**
 * The technician's feedback text of an Issue (the Issue's message): the Admin writes or edits it here, independent of the
 * verdict buttons - before, together with or after a review. Saved with PUT /api/Issue/{id} carrying only the message, so it
 * never changes the review state, never touches training eligibility and schedules no retraining.
 */
export function IssueFeedbackEditor({ deviceId, issueId, message, reviewed }: { deviceId: number; issueId: number; message: string; reviewed: boolean }) {
  const t = useT();
  const { language } = useLanguage();
  const toast = useAppToast();
  const update = useUpdateIssue(deviceId, issueId);
  const [text, setText] = useState(message);
  const changed = text !== message;
  const tooLong = text.length > MAX_FEEDBACK_LENGTH;

  return (
    <Field
      label={t('Feedback')}
      hint={
        reviewed
          ? t('Shown with the Issue (and on the Device). Kept as you wrote it.')
          : t('Shown with the Issue (and on the Device). While the Issue is not reviewed, a new automatic analysis may replace this text; once a verdict is recorded it stays.')
      }
      validationState={tooLong ? 'error' : 'none'}
      validationMessage={tooLong ? t('At most {0} characters.', MAX_FEEDBACK_LENGTH) : `${text.length} / ${MAX_FEEDBACK_LENGTH}`}
    >
      <Textarea
        value={text}
        rows={3}
        resize="vertical"
        disabled={update.isPending}
        onChange={(_, d) => setText(d.value)}
      />
      <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalS }}>
        <Button
          appearance="primary"
          disabled={!changed || tooLong || update.isPending}
          onClick={() => update.mutate({ message: text }, { onSuccess: () => toast.success(t('Feedback saved')) })}
        >
          {update.isPending ? t('Saving…') : t('Save feedback')}
        </Button>
        <Button appearance="secondary" disabled={!changed || update.isPending} onClick={() => setText(message)}>
          {t('Revert')}</Button>
      </div>
      {changed && (
        <MessageBar intent="warning" style={{ marginTop: tokens.spacingVerticalS }}>
          <MessageBarBody>
            {language === 'hu'
              ? t('The last edit wins: after saving, the English text is made again from this Hungarian text about five minutes after the last change, and anything written in English before is replaced.')
              : t('The last edit wins: after saving, the Hungarian text is made again from this English text about five minutes after the last change, and anything written in Hungarian before is replaced.')}
          </MessageBarBody>
        </MessageBar>
      )}
      {update.isError && <ErrorState error={update.error} />}
    </Field>
  );
}

export function IssueDetailPage() {
  const t = useT();
  const { language } = useLanguage();
  const styles = useStyles();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useAppToast();
  const { issueId } = useParams<{ issueId: string }>();
  const id = Number(issueId);
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  const issueMessages = (issueQuery.data ?? {}) as IssueMessages;
  const shownMessage = localizedIssueMessage(issueMessages, language);
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
  // Maintenances of the Issue's Sensor inside the plotted span (blue dashed lines).
  const maintenanceQuery = useMaintenanceHistory(issueQuery.data?.deviceId);
  const markers = useMemo(
    () => maintenanceMarkers(maintenanceQuery.data?.items, primarySensorId === undefined ? [] : [primarySensorId]),
    [maintenanceQuery.data, primarySensorId],
  );

  if (issueQuery.isLoading) return <LoadingState label={t('Loading issue…')} />;
  if (issueQuery.isError) return <ErrorState error={issueQuery.error} onRetry={() => issueQuery.refetch()} />;
  const issue = issueQuery.data;
  if (!issue) return null;

  return (
    <>
      <PageHeader
        title={t('Issue #{0}', issue.issueKey)}
        titleDisplay="compact"
        description={`${formatDateTime(issue.measuredAtFrom)} → ${formatDateTime(issue.measuredAtTo)}`}
        actions={
          isAdmin && (
            <>
              {issue.reviewState !== 'PendingReview' && (
                <Button
                  icon={<ArrowUndo24Regular />}
                  onClick={() => reopenIssue.mutate(id, { onSuccess: () => toast.success(t('Issue reopened for review')) })}
                  disabled={reopenIssue.isPending}
                >
                  {reopenIssue.isPending ? t('Reopening…') : t('Reopen for review')}
                </Button>
              )}
              <Button icon={<Delete24Regular />} onClick={() => setDeleteOpen(true)}>
                {t('Delete Issue')}</Button>
            </>
          )
        }
      />

      {isAdmin && deleteOpen && (
        <DeleteIssueDialog
          deviceId={issue.deviceId!}
          issueId={id}
          issueKey={issue.issueKey}
          reviewed={issue.reviewState !== 'PendingReview'}
          isCanonical={issue.isCanonical === true}
          memberCount={groupQuery.data?.members?.length ?? 0}
          open
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => navigate(`/issues?deviceId=${issue.deviceId}`)}
        />
      )}

      <div className={styles.layout}>
        <div>
          <Card className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', flexWrap: 'wrap' }}>
                <ReviewStatePill reviewState={issue.reviewState} />
                <EmailSentPill issue={issue} />
              </div>
              {!issue.isCanonical && <Badge appearance="outline">{t('member of canonical #')}{issue.canonicalIssueId}</Badge>}
            </div>
            {issue.notificationSentAt && (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {emailSentText(issue, t)}
              </Text>
            )}
            {isAdmin ? (
              <IssueFeedbackEditor
                key={`${issue.id}-${language}`}
                deviceId={issue.deviceId!}
                issueId={id}
                message={shownMessage ?? ''}
                reviewed={issue.reviewState !== 'PendingReview'}
              />
            ) : (
              shownMessage && <Text>{shownMessage}</Text>
            )}
            {isAdmin && issue.message && (
              <Field label={language === 'hu' ? t('English text (translated automatically)') : t('Hungarian text (translated automatically)')}>
                <Text>{(language === 'hu' ? issueMessages.messageEn : issueMessages.messageHu) || t('Not translated yet - it appears about five minutes after the last change.')}</Text>
              </Field>
            )}

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
                                  ? t('Review saved - coalesced into the pending retraining request')
                                  : t('Review saved - retraining scheduled'),
                              );
                            } else {
                              toast.success(t('Review saved'));
                            }
                          },
                        },
                      )
                    }
                  >
                    {t(opt.label)}
                  </Button>
                ))}
              </div>
            )}
            {reviewIssue.isError && <ErrorState error={reviewIssue.error} />}
          </Card>

          <Card className={styles.card}>
            <Body1Strong>{t('Telemetry')}</Body1Strong>
            {periodChart.isLoading && <LoadingState label="" />}
            {periodChart.isError && <ErrorState error={periodChart.error} />}
            {periodChart.data && (
              // Clicking the chart (or its Enlarge button) opens it large in a modal window, like on Smart Analytics.
              <EnlargeableTelemetryChart
                title={primarySensor?.name || primarySensor?.externalSensorId || t('Telemetry')}
                describedSensors={[{ deviceId: issueQuery.data?.deviceId, sensorId: primarySensorId ?? undefined, sensorName: primarySensor?.externalSensorId }]}
                series={[{ label: primarySensor?.name || 'Sensor', points: periodChart.data, bidirectional: primarySensor?.direction === 'bidirectional', direction: primarySensor?.direction, unitLabel: primarySensor?.unitLabel }]}
                mode="single"
                showControlLimits
                maintenances={markers}
                height={280}
              />
            )}
            {/* The API's own number: the sum of the stored anomaly values (1 warning, 2 critical) inside the Issue's range - what the Sensor's Min issue score is compared with. */}
            {issue.score != null && (
              <Text size={300} data-testid="issue-score">
                <Text weight="semibold">{t('Issue score')}:</Text> {issue.score}
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{' · '}{t('sum of the anomaly values (1 warning, 2 critical) inside the Issue')}</Text>
              </Text>
            )}
          </Card>

          {groupQuery.data && groupQuery.data.members && groupQuery.data.members.length > 0 && (
            <Card className={styles.card}>
              <Body1Strong>{t('Grouped members (')}{groupQuery.data.members.length})</Body1Strong>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {t('Nothing here is ever deleted - moving or reassigning only changes which Issue is the group\'s canonical representative.')}</Text>
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
              onClick={() => ungroup.mutate(id, { onSuccess: () => toast.success(t('Issue ungrouped - now canonical for itself')) })}
              disabled={ungroup.isPending}
            >
              {t('Ungroup from canonical Issue')}</Button>
          )}
        </div>

        <div>
          <Card className={styles.card}>
            <Body1Strong>{t('Category')}</Body1Strong>
            {categoriesQuery.isLoading && <LoadingState label="" />}
            {isAdmin && issue.isCanonical ? (
              <Select
                value={issue.issueCategoryId !== undefined && issue.issueCategoryId !== null ? String(issue.issueCategoryId) : ''}
                onChange={(_, d) =>
                  assignCategory.mutate(
                    { issueCategoryId: d.value ? Number(d.value) : null },
                    { onSuccess: () => toast.success(d.value ? t('Category assigned') : t('Category cleared')) },
                  )
                }
              >
                <option value="">{t('Uncategorized')}</option>
                {categoriesQuery.data?.filter((c) => c.enabled).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Text>{issue.issueCategoryName ?? t('Uncategorized')}</Text>
            )}
            {!issue.isCanonical && (
              <MessageBar intent="info">
                <MessageBarBody>{t('Category can only be set on the canonical Issue.')}</MessageBarBody>
              </MessageBar>
            )}
          </Card>

          {isAdmin && issue.isCanonical && (
            <Card className={styles.card}>
              <Body1Strong>{t('Category suggestion')}</Body1Strong>
              {suggestionQuery.data === null && (
                <Button
                  onClick={() => requestSuggestion.mutate(undefined, { onSuccess: () => toast.info(t('Category suggestion requested')) })}
                  disabled={requestSuggestion.isPending}
                >
                  {requestSuggestion.isPending ? t('Requesting…') : t('Ask Ollama to suggest a category')}
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
                            { onSuccess: () => toast.success(t('Category suggestion accepted')) },
                          )
                        }
                        disabled={decideSuggestion.isPending}
                      >
                        {t('Accept')}</Button>
                      <Button
                        size="small"
                        appearance="secondary"
                        onClick={() => decideSuggestion.mutate({ accept: false }, { onSuccess: () => toast.info(t('Category suggestion rejected')) })}
                        disabled={decideSuggestion.isPending}
                      >
                        {t('Reject')}</Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          <Card className={styles.card}>
            <Body1Strong>{t('Ollama summary')}</Body1Strong>
            <OllamaSummary issueId={id} />
          </Card>
        </div>
      </div>
    </>
  );
}
