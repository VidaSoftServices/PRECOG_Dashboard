import { useParams, useNavigate } from 'react-router-dom';
import { Card, Text, Body1Strong, Button, Badge, makeStyles, tokens } from '@fluentui/react-components';
import { Search24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { ReviewStatePill } from '@/components/StatusPill';
import { useDevice } from '@/api/hooks/devices';
import { useRunModelQuery } from '@/api/hooks/modelQuery';
import { formatDateTime } from '@/lib/dateTime';
import { activateProps } from '@/lib/useActivateProps';

const useStyles = makeStyles({
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}` },
  card: { padding: tokens.spacingVerticalM, marginBottom: tokens.spacingVerticalM },
});

export function ModelQueryPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { deviceId } = useParams<{ deviceId: string }>();
  const id = Number(deviceId);
  const deviceQuery = useDevice(id);
  const runQuery = useRunModelQuery(id);

  return (
    <>
      <PageHeader
        title={`Model query · ${deviceQuery.data?.deviceName ?? ''}`}
        description="Ranks historically similar canonical Issues against this Device's active model. Similarity, not a probability of failure."
        actions={
          <Button icon={<Search24Regular />} appearance="primary" disabled={runQuery.isPending} onClick={() => runQuery.mutate(undefined)}>
            {runQuery.isPending ? 'Querying…' : 'Run query'}
          </Button>
        }
      />

      {runQuery.isError && <ErrorState error={runQuery.error} />}
      {!runQuery.data && !runQuery.isPending && <EmptyState title="Run a query to see results" description="Rate-limited to 20 requests/minute - use deliberately, not on every page load." />}
      {runQuery.isPending && <LoadingState label="Querying model…" />}

      {runQuery.data && (
        <>
          <Card className={styles.card}>
            <Body1Strong>Model version {runQuery.data.versionNumber}</Body1Strong>
            <Text size={200} style={{ display: 'block', color: tokens.colorNeutralForeground3 }}>
              Reference time: {formatDateTime(runQuery.data.referenceTime)} · Sensors: {(runQuery.data.sensorIds ?? []).length}
            </Text>
          </Card>

          {runQuery.data.categorySuggestion && (
            <Card className={styles.card}>
              <Body1Strong>Category evidence</Body1Strong>
              {runQuery.data.categorySuggestion.suggestedCategoryName ? (
                <Text>
                  Suggested: {runQuery.data.categorySuggestion.suggestedCategoryName}
                  {runQuery.data.categorySuggestion.hasConflict && <Badge color="warning" style={{ marginLeft: 8 }}>Conflicting evidence</Badge>}
                </Text>
              ) : (
                <Text size={200}>No unanimous category evidence.</Text>
              )}
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {runQuery.data.categorySuggestion.confirmedCategoryCount ?? 0} confirmed category label(s) among similar Issues.
              </Text>
            </Card>
          )}

          <Body1Strong>Ranked similar Issues</Body1Strong>
          {(runQuery.data.rankedIssues ?? []).length === 0 && <EmptyState title="No similar historical Issues found" />}
          <Card style={{ marginTop: tokens.spacingVerticalS }}>
            {(runQuery.data.rankedIssues ?? []).map((issue) => (
              <div key={issue.issueId} className={styles.row} style={{ cursor: 'pointer' }} {...activateProps(() => navigate(`/issues/${issue.issueId}`))}>
                <div>
                  <Text weight="semibold">
                    {issue.relevancePercent?.toFixed(1)}% similar {issue.isSharedKnowledge && <Badge appearance="outline">shared knowledge</Badge>}
                  </Text>
                  <br />
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {formatDateTime(issue.measuredAtFrom)} {issue.issueCategoryName ? `· ${issue.issueCategoryName}` : ''}
                  </Text>
                </div>
                <ReviewStatePill reviewState={issue.reviewState} />
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
