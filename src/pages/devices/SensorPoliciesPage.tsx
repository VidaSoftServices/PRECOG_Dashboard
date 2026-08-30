import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Text,
  Body1Strong,
  Input,
  Field,
  Button,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddCircle24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { EnabledPill } from '@/components/StatusPill';
import { DateTimeField } from '@/components/DateTimeField';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useSensor } from '@/api/hooks/sensors';
import { useAggregationPolicies, useUpdateAggregationPolicy } from '@/api/hooks/aggregationPolicies';
import { useSetpoints, useEffectiveSetpoint, useCreateSetpoint } from '@/api/hooks/setpoints';
import { useAuth } from '@/auth/AuthContext';
import { formatDateTimeWithZone, toApiIso } from '@/lib/dateTime';
import type { SensorAggregationPolicyDto } from '@/api/hooks/aggregationPolicies';

const useStyles = makeStyles({
  card: {
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM,
  },
  row: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
});

function PolicyCard({ deviceId, sensorId, policy }: { deviceId: number; sensorId: number; policy: SensorAggregationPolicyDto }) {
  const styles = useStyles();
  const { isAdmin } = useAuth();
  const toast = useAppToast();
  const update = useUpdateAggregationPolicy(deviceId, sensorId, policy.id!);
  const [lookback, setLookback] = useState(String(policy.lookback ?? ''));
  const [scale, setScale] = useState(policy.scale ?? '');
  const [minIssueScore, setMinIssueScore] = useState(String(policy.minIssueScore ?? ''));
  const [retrainConfirmOpen, setRetrainConfirmOpen] = useState(false);
  const isRaw = policy.timeScale === 'native' && policy.aggregationFunction === 'raw';

  const applyUpdate = () => {
    update.mutate(
      { lookback: Number(lookback), scale, minIssueScore: Number(minIssueScore) },
      { onSuccess: () => toast.success('Aggregation policy saved') },
    );
  };

  const save = () => {
    const lookbackChanged = String(policy.lookback) !== lookback;
    const scaleChanged = policy.scale !== scale;
    if (isRaw && (lookbackChanged || scaleChanged)) {
      setRetrainConfirmOpen(true);
      return;
    }
    applyUpdate();
  };

  return (
    <Card className={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Body1Strong>
          {policy.sourceDataKey} · {policy.timeScale} · {policy.aggregationFunction}
          {isRaw && ' (raw)'}
        </Body1Strong>
        <EnabledPill enabled={policy.enabled} />
      </div>
      <div className={styles.row}>
        <Field label="Lookback">
          <Input value={lookback} onChange={(_, d) => setLookback(d.value)} disabled={!isAdmin} type="number" />
        </Field>
        <Field label="Scale">
          <Input value={scale} onChange={(_, d) => setScale(d.value)} disabled={!isAdmin} />
        </Field>
        <Field label="Min issue score">
          <Input value={minIssueScore} onChange={(_, d) => setMinIssueScore(d.value)} disabled={!isAdmin} type="number" />
        </Field>
      </div>
      {isAdmin && (
        <div>
          <Button appearance="primary" onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
      {update.isError && <ErrorState error={update.error} />}
      {isRaw && (
        <MessageBar intent="info">
          <MessageBarBody>Editing Lookback, Scale, or Enabled on the raw policy schedules retraining for this Sensor.</MessageBarBody>
        </MessageBar>
      )}
      <ConfirmDialog
        open={retrainConfirmOpen}
        title="This will trigger retraining"
        intent="destructive"
        confirmLabel="Save and retrain"
        busy={update.isPending}
        onConfirm={() => {
          setRetrainConfirmOpen(false);
          applyUpdate();
        }}
        onCancel={() => setRetrainConfirmOpen(false)}
      >
        <Text>
          Changing Lookback or Scale on the raw aggregation policy schedules a full retraining for this Sensor. This
          can&apos;t be undone once submitted. Continue?
        </Text>
      </ConfirmDialog>
    </Card>
  );
}

function SetpointsCard({ deviceId, sensorId, bidirectional }: { deviceId: number; sensorId: number; bidirectional: boolean }) {
  const styles = useStyles();
  const { isAdmin } = useAuth();
  const toast = useAppToast();
  const setpointsQuery = useSetpoints(deviceId, sensorId);
  const effectiveQuery = useEffectiveSetpoint(deviceId, sensorId);
  const createSetpoint = useCreateSetpoint(deviceId, sensorId);

  const [showForm, setShowForm] = useState(false);
  const [validFrom, setValidFrom] = useState<Date | null>(new Date());
  const [target, setTarget] = useState('');
  const [tolerance, setTolerance] = useState('');
  const [targetAbove, setTargetAbove] = useState('');
  const [toleranceAbove, setToleranceAbove] = useState('');
  const [targetBelow, setTargetBelow] = useState('');
  const [toleranceBelow, setToleranceBelow] = useState('');

  const submit = async () => {
    if (!validFrom) return;
    await createSetpoint.mutateAsync(
      bidirectional
        ? {
            validFrom: toApiIso(validFrom),
            targetAbove: targetAbove ? Number(targetAbove) : undefined,
            toleranceAbove: toleranceAbove ? Number(toleranceAbove) : undefined,
            targetBelow: targetBelow ? Number(targetBelow) : undefined,
            toleranceBelow: toleranceBelow ? Number(toleranceBelow) : undefined,
          }
        : {
            validFrom: toApiIso(validFrom),
            target: target ? Number(target) : undefined,
            tolerance: tolerance ? Number(tolerance) : undefined,
          },
    );
    toast.success('Setpoint created');
    setShowForm(false);
    setTarget('');
    setTolerance('');
    setTargetAbove('');
    setToleranceAbove('');
    setTargetBelow('');
    setToleranceBelow('');
  };

  return (
    <Card className={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Body1Strong>Setpoints</Body1Strong>
        {isAdmin && (
          <Button size="small" icon={<AddCircle24Regular />} onClick={() => setShowForm((v) => !v)}>
            New setpoint
          </Button>
        )}
      </div>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        Time-versioned target/tolerance configuration - append-only, never edited or deleted. For historical fault
        analysis, use the setpoint effective at measurement time, not the latest one.
      </Text>

      {effectiveQuery.data && (
        <MessageBar intent="info">
          <MessageBarBody>
            Effective now:{' '}
            {bidirectional
              ? `above ${effectiveQuery.data.targetAbove ?? '—'} ± ${effectiveQuery.data.toleranceAbove ?? '—'}, below ${effectiveQuery.data.targetBelow ?? '—'} ± ${effectiveQuery.data.toleranceBelow ?? '—'}`
              : `${effectiveQuery.data.target ?? '—'} ± ${effectiveQuery.data.tolerance ?? '—'}`}
          </MessageBarBody>
        </MessageBar>
      )}

      {showForm && isAdmin && (
        <div className={styles.card} style={{ background: tokens.colorNeutralBackground2 }}>
          <div className={styles.row}>
            <DateTimeField label="Valid from" value={validFrom} onChange={setValidFrom} />
          </div>
          {bidirectional ? (
            <div className={styles.row}>
              <Field label="Target above">
                <Input type="number" value={targetAbove} onChange={(_, d) => setTargetAbove(d.value)} />
              </Field>
              <Field label="Tolerance above">
                <Input type="number" value={toleranceAbove} onChange={(_, d) => setToleranceAbove(d.value)} />
              </Field>
              <Field label="Target below">
                <Input type="number" value={targetBelow} onChange={(_, d) => setTargetBelow(d.value)} />
              </Field>
              <Field label="Tolerance below">
                <Input type="number" value={toleranceBelow} onChange={(_, d) => setToleranceBelow(d.value)} />
              </Field>
            </div>
          ) : (
            <div className={styles.row}>
              <Field label="Target">
                <Input type="number" value={target} onChange={(_, d) => setTarget(d.value)} />
              </Field>
              <Field label="Tolerance">
                <Input type="number" value={tolerance} onChange={(_, d) => setTolerance(d.value)} />
              </Field>
            </div>
          )}
          {createSetpoint.isError && <ErrorState error={createSetpoint.error} />}
          <Button appearance="primary" onClick={submit} disabled={!validFrom || createSetpoint.isPending}>
            {createSetpoint.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      )}

      {setpointsQuery.isLoading && <LoadingState label="" />}
      {setpointsQuery.data && setpointsQuery.data.length === 0 && <EmptyState title="No setpoints configured" />}
      {setpointsQuery.data && setpointsQuery.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Valid from</TableHeaderCell>
              <TableHeaderCell>Valid to</TableHeaderCell>
              <TableHeaderCell>{bidirectional ? 'Above / Below' : 'Target ± Tolerance'}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {setpointsQuery.data.map((sp) => (
              <TableRow key={sp.id}>
                <TableCell>{formatDateTimeWithZone(sp.validFrom)}</TableCell>
                <TableCell>{sp.validTo ? formatDateTimeWithZone(sp.validTo) : 'open-ended'}</TableCell>
                <TableCell>
                  {bidirectional
                    ? `${sp.targetAbove ?? '—'} ± ${sp.toleranceAbove ?? '—'} / ${sp.targetBelow ?? '—'} ± ${sp.toleranceBelow ?? '—'}`
                    : `${sp.target ?? '—'} ± ${sp.tolerance ?? '—'}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

export function SensorPoliciesPage() {
  const { deviceId, sensorId } = useParams<{ deviceId: string; sensorId: string }>();
  const dId = Number(deviceId);
  const sId = Number(sensorId);

  const sensorQuery = useSensor(dId, sId);
  const policiesQuery = useAggregationPolicies(dId, sId);

  if (sensorQuery.isLoading || policiesQuery.isLoading) return <LoadingState label="Loading policies…" />;
  if (sensorQuery.isError) return <ErrorState error={sensorQuery.error} />;
  if (policiesQuery.isError) return <ErrorState error={policiesQuery.error} onRetry={() => policiesQuery.refetch()} />;

  return (
    <>
      <PageHeader
        title={`${sensorQuery.data?.name || sensorQuery.data?.externalSensorId} · Sensor configuration`}
        description={`${sensorQuery.data?.direction ?? ''} ${sensorQuery.data?.quantityKind ? '· ' + sensorQuery.data.quantityKind : ''}`}
      />

      <Body1Strong style={{ display: 'block', marginBottom: tokens.spacingVerticalS }}>Aggregation policies</Body1Strong>
      {policiesQuery.data && policiesQuery.data.length === 0 && <EmptyState title="No aggregation policies" />}
      {policiesQuery.data?.map((policy) => (
        <PolicyCard key={policy.id} deviceId={dId} sensorId={sId} policy={policy} />
      ))}

      {sensorQuery.data && (
        <SetpointsCard deviceId={dId} sensorId={sId} bidirectional={sensorQuery.data.direction === 'bidirectional'} />
      )}
    </>
  );
}
