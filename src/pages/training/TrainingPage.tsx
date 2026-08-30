import { useNavigate } from 'react-router-dom';
import { Card, Text, Button, Select, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components';
import { BrainCircuit24Regular, Search24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { JobStatusPill } from '@/components/StatusPill';
import { useDevices } from '@/api/hooks/devices';
import { useTrainingRequests, useCreateTrainingRequest } from '@/api/hooks/training';
import { useNumberSearchParam } from '@/lib/useNumberSearchParam';
import { formatDateTime, formatRelative } from '@/lib/dateTime';
import { useAuth } from '@/auth/AuthContext';
import { useAppToast } from '@/components/ToastProvider';

const useStyles = makeStyles({
  toolbar: { display: 'flex', gap: tokens.spacingHorizontalM, marginBottom: tokens.spacingVerticalL, alignItems: 'center', flexWrap: 'wrap' },
  row: { display: 'flex', justifyContent: 'space-between', padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}` },
});

/**
 * Manual retraining is Admin-only in this frontend, deliberately stricter
 * than the live API: `Training_CreateTrainingRequest` only checks Device
 * access server-side, not IsCompanyAdmin, so a Reader's request would
 * actually succeed against the real backend. The product rule is that
 * Reader stays strictly read-only regardless - a callable endpoint is not
 * the same as an approved Reader workflow. Recorded as a backend
 * authorization/documentation gap in TASK_IMPLEMENTATION.md; not modified
 * here or on the backend.
 */
export function TrainingPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useAppToast();
  const devicesQuery = useDevices();
  const [deviceId, setDeviceId] = useNumberSearchParam('deviceId');
  const devices = devicesQuery.data ?? [];
  const effectiveDeviceId = deviceId ?? devices[0]?.id;

  const requestsQuery = useTrainingRequests(effectiveDeviceId);
  const createRequest = useCreateTrainingRequest(effectiveDeviceId ?? -1);

  if (devicesQuery.isLoading) return <LoadingState label="Loading devices…" />;
  if (devicesQuery.isError) return <ErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />;

  return (
    <>
      <PageHeader
        title="Training & Models"
        description="Model training requests and lifecycle for the selected Device."
        actions={
          effectiveDeviceId !== undefined && (
            <>
              {isAdmin && (
                <Button
                  icon={<BrainCircuit24Regular />}
                  disabled={createRequest.isPending}
                  onClick={() =>
                    createRequest.mutate(undefined, {
                      // Training_CreateTrainingRequest returns 202 Accepted with
                      // no response body, so whether this coalesced into an
                      // existing Pending request or created a new one isn't
                      // knowable from the response - only from the refetched
                      // list below, which the mutation already invalidates.
                      onSuccess: () => toast.success('Retraining requested'),
                    })
                  }
                >
                  {createRequest.isPending ? 'Requesting…' : 'Request retraining'}
                </Button>
              )}
              <Button icon={<Search24Regular />} onClick={() => navigate(`/devices/${effectiveDeviceId}/model-query`)}>
                Model query
              </Button>
            </>
          )
        }
      />

      <div className={styles.toolbar}>
        <Select aria-label="Device" value={effectiveDeviceId !== undefined ? String(effectiveDeviceId) : ''} onChange={(_, d) => setDeviceId(Number(d.value))}>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.deviceName || d.externalDeviceId}
            </option>
          ))}
        </Select>
      </div>

      <MessageBar intent="info" style={{ marginBottom: tokens.spacingVerticalM }}>
        <MessageBarBody>
          There is no ModelVersion history endpoint in the current API - only the active model reference on each
          TrainingRequest is available. Previous-version browsing is a documented backend gap, not shown here.
        </MessageBarBody>
      </MessageBar>

      {createRequest.isError && <ErrorState error={createRequest.error} />}

      {requestsQuery.isLoading && <LoadingState label="Loading training requests…" />}
      {requestsQuery.isError && <ErrorState error={requestsQuery.error} onRetry={() => requestsQuery.refetch()} />}
      {requestsQuery.data && requestsQuery.data.length === 0 && <EmptyState title="No training requests yet" />}

      {requestsQuery.data && requestsQuery.data.length > 0 && (
        <Card>
          {requestsQuery.data.map((request) => (
            <div key={request.id} className={styles.row}>
              <div>
                <Text weight="semibold">Generation {request.requestedGeneration}</Text>
                <br />
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  Requested {formatRelative(request.requestedAt)} · {(request.triggerReasons ?? []).join(', ') || 'manual'}
                </Text>
                {request.failureReason && (
                  <Text size={200} style={{ color: tokens.colorPaletteRedForeground1, display: 'block' }}>
                    {request.failureReason}
                  </Text>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, alignItems: 'flex-end' }}>
                <JobStatusPill status={request.status} />
                {request.completedAt && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {formatDateTime(request.completedAt)}
                  </Text>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
