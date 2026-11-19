import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Text,
  Body1Strong,
  Input,
  Select,
  Switch,
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
import { AddCircle24Regular, Delete24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { EnabledPill } from '@/components/StatusPill';
import { DateTimeField } from '@/components/DateTimeField';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useSensor } from '@/api/hooks/sensors';
import { MetricDefinitionCard } from './MetricDefinitionCard';
import { DeleteSetpointsDialog } from './DeleteSetpointsDialog';
import { isRawPolicy } from '@/lib/policies';
import {
  AGGREGATION_FUNCTION_OPTIONS,
  DEFAULT_MIN_EVALUATION_PERCENT,
  SCALE_OPTIONS,
  SOURCE_DATA_KEY,
  TIME_SCALE_OPTIONS,
} from '@/lib/aggregationOptions';
import {
  useAggregationPolicies,
  useUpdateAggregationPolicy,
  useCreateAggregationPolicy,
  useDeactivateAggregationPolicy,
  usePolicyValues,
  type CreateAggregationPolicyRequest,
} from '@/api/hooks/aggregationPolicies';
import { useSetpoints, useEffectiveSetpoint, useCreateSetpoint } from '@/api/hooks/setpoints';
import { useAuth } from '@/auth/AuthContext';
import { formatDateTimeWithZone, toApiIso } from '@/lib/dateTime';
import type { SensorAggregationPolicyDto } from '@/api/hooks/aggregationPolicies';
import { useT } from '@/lib/language';

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

/**
 * How far the API's aggregation engine has got with a non-raw level, and its newest buckets: "Calculated up to ..." comes from the policy's own
 * `backfilledUntil` (every closed slice before it is done); the latest slices are read from the bounded values endpoint (the newest one may still be
 * open). Nothing is calculated here - every number is the API's.
 */
function AggregationStatus({ deviceId, sensorId, policy }: { deviceId: number; sensorId: number; policy: SensorAggregationPolicyDto }) {
  const t = useT();
  const values = usePolicyValues(deviceId, sensorId, policy.id!, policy.enabled !== false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS }}>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        {policy.enabled === false
          ? t('Deactivated: nothing is calculated.')
          : policy.backfilledUntil
            ? t('Calculated up to {0} (the open slice is updated continuously).', formatDateTimeWithZone(policy.backfilledUntil))
            : t('Not calculated yet: the API starts with the oldest data and works forward.')}
      </Text>
      {values.data && values.data.length > 0 && (
        <table aria-label={t('Latest aggregated values')} style={{ borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingRight: tokens.spacingHorizontalM }}>{t('Slice start')}</th>
              <th style={{ textAlign: 'right', paddingRight: tokens.spacingHorizontalM }}>{t('Value')}</th>
              <th style={{ textAlign: 'right' }}>{t('Readings')}</th>
            </tr>
          </thead>
          <tbody>
            {[...values.data].reverse().map((v) => (
              <tr key={v.bucketStart}>
                <td style={{ paddingRight: tokens.spacingHorizontalM }}>{formatDateTimeWithZone(v.bucketStart)}</td>
                <td style={{ textAlign: 'right', paddingRight: tokens.spacingHorizontalM }}>{v.value === null || v.value === undefined ? '—' : Number(v.value.toPrecision(7))}</td>
                <td style={{ textAlign: 'right' }}>{v.sampleCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** The minimum evaluation field: empty (the API default applies) or a whole number from 0 to 100. */
function minEvaluationValid(text: string): boolean {
  return text.trim() === '' || (/^\d+$/.test(text.trim()) && Number(text) <= 100);
}

function PolicyCard({ deviceId, sensorId, policy }: { deviceId: number; sensorId: number; policy: SensorAggregationPolicyDto }) {
  const t = useT();
  const styles = useStyles();
  const { isAdmin } = useAuth();
  const toast = useAppToast();
  const update = useUpdateAggregationPolicy(deviceId, sensorId, policy.id!);
  const deactivate = useDeactivateAggregationPolicy(deviceId, sensorId);
  const [lookback, setLookback] = useState(String(policy.lookback ?? ''));
  const [scale, setScale] = useState(policy.scale ?? '');
  const [minIssueScore, setMinIssueScore] = useState(String(policy.minIssueScore ?? ''));
  const [minEvaluation, setMinEvaluation] = useState(String(policy.minEvaluationPercent ?? DEFAULT_MIN_EVALUATION_PERCENT));
  const [calculate, setCalculate] = useState(policy.calculationEnabled !== false);
  const [retrainConfirmOpen, setRetrainConfirmOpen] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const isRaw = isRawPolicy(policy);

  const applyUpdate = () => {
    update.mutate(
      { lookback: Number(lookback), scale, minIssueScore: Number(minIssueScore), ...(isRaw ? {} : { minEvaluationPercent: Number(minEvaluation), calculationEnabled: calculate }) },
      { onSuccess: () => toast.success(t('Aggregation policy saved')) },
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
          {isRaw && t(' (raw)')}
        </Body1Strong>
        <EnabledPill enabled={policy.enabled} />
      </div>
      <div className={styles.row}>
        <Field label={t('Lookback')}>
          <Input value={lookback} onChange={(_, d) => setLookback(d.value)} disabled={!isAdmin} type="number" />
        </Field>
        <Field label={t('Scale')}>
          <Input value={scale} onChange={(_, d) => setScale(d.value)} disabled={!isAdmin} />
        </Field>
        <Field label={t('Min issue score')}>
          <Input value={minIssueScore} onChange={(_, d) => setMinIssueScore(d.value)} disabled={!isAdmin} type="number" />
        </Field>
        {!isRaw && (
          <Field label={t('Minimum evaluation (%)')} hint={t('The running slice is evaluated for anomalies only once it covers this share of its length')} validationState={minEvaluationValid(minEvaluation) ? 'none' : 'error'} validationMessage={minEvaluationValid(minEvaluation) ? undefined : t('A whole number from 0 to 100')}>
            <Input value={minEvaluation} onChange={(_, d) => setMinEvaluation(d.value)} disabled={!isAdmin} type="number" min="0" max="100" />
          </Field>
        )}
        {!isRaw && (
          <Field label={t('Calculate')} hint={t('Off: the level is only aggregated, to look at the data - no anomaly, no Issue from it')}>
            <Switch checked={calculate} onChange={(_, d) => setCalculate(d.checked)} disabled={!isAdmin} label={calculate ? t('On') : t('Off')} />
          </Field>
        )}
      </div>
      {!isRaw && <AggregationStatus deviceId={deviceId} sensorId={sensorId} policy={policy} />}
      {isAdmin && (
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalM }}>
          <Button appearance="primary" onClick={save} disabled={update.isPending || (!isRaw && !minEvaluationValid(minEvaluation))}>
            {update.isPending ? t('Saving…') : t('Save')}
          </Button>
          {!isRaw && (
            <Button appearance="secondary" onClick={() => setDeactivateConfirmOpen(true)} disabled={!policy.enabled || deactivate.isPending}>
              {deactivate.isPending ? t('Deactivating…') : t('Deactivate')}
            </Button>
          )}
        </div>
      )}
      {update.isError && <ErrorState error={update.error} />}
      {deactivate.isError && <ErrorState error={deactivate.error} />}
      {isRaw && (
        <MessageBar intent="info">
          <MessageBarBody>{t('Editing Lookback, Scale, or Enabled on the raw policy schedules retraining for this Sensor.')}</MessageBarBody>
        </MessageBar>
      )}
      <ConfirmDialog
        open={retrainConfirmOpen}
        title={t('This will trigger retraining')}
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
          {t('Changing Lookback or Scale on the raw aggregation policy schedules a full retraining for this Sensor. This can\'t be undone once submitted. Continue?')}</Text>
      </ConfirmDialog>
      <ConfirmDialog
        open={deactivateConfirmOpen}
        title={t('Deactivate this aggregation level?')}
        intent="destructive"
        confirmLabel="Deactivate"
        busy={deactivate.isPending}
        onConfirm={() => {
          deactivate.mutate(policy.id!, {
            onSuccess: () => {
              toast.success(t('Aggregation level deactivated'));
              setDeactivateConfirmOpen(false);
            },
          });
        }}
        onCancel={() => setDeactivateConfirmOpen(false)}
      >
        <Text>
          {t('This soft-disables the')}{' '}{policy.sourceDataKey} · {policy.timeScale} · {policy.aggregationFunction} {t('level - it stops new aggregation but its history is preserved. There is no undo through this dashboard once deactivated.')}</Text>
      </ConfirmDialog>
    </Card>
  );
}

function SetpointsCard({ deviceId, sensorId, bidirectional }: { deviceId: number; sensorId: number; bidirectional: boolean }) {
  const t = useT();
  const styles = useStyles();
  const { isAdmin } = useAuth();
  const toast = useAppToast();
  const setpointsQuery = useSetpoints(deviceId, sensorId);
  const effectiveQuery = useEffectiveSetpoint(deviceId, sensorId);
  const createSetpoint = useCreateSetpoint(deviceId, sensorId);

  const [showForm, setShowForm] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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
    toast.success(t('Setpoint created'));
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
        <Body1Strong>{t('Setpoints')}</Body1Strong>
        {isAdmin && (
          <Button size="small" icon={<AddCircle24Regular />} onClick={() => setShowForm((v) => !v)}>
            {t('New setpoint')}</Button>
        )}
      </div>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        {t('Time-versioned target/tolerance configuration: a change is a new interval (the previous one ends where it begins). For historical fault analysis, use the setpoint effective at measurement time, not the latest one. An interval can be deleted with the button below.')}</Text>

      {effectiveQuery.data && (
        <MessageBar intent="info">
          <MessageBarBody>
            {t('Effective now:')}{' '}
            {bidirectional
              ? t('above {0} ± {1}, below {2} ± {3}', effectiveQuery.data.targetAbove ?? '—', effectiveQuery.data.toleranceAbove ?? '—', effectiveQuery.data.targetBelow ?? '—', effectiveQuery.data.toleranceBelow ?? '—')
              : `${effectiveQuery.data.target ?? '—'} ± ${effectiveQuery.data.tolerance ?? '—'}`}
          </MessageBarBody>
        </MessageBar>
      )}

      {showForm && isAdmin && (
        <div className={styles.card} style={{ background: tokens.colorNeutralBackground2 }}>
          <div className={styles.row}>
            <DateTimeField label={t('Valid from')} value={validFrom} onChange={setValidFrom} />
          </div>
          {bidirectional ? (
            <div className={styles.row}>
              <Field label={t('Target above')}>
                <Input type="number" value={targetAbove} onChange={(_, d) => setTargetAbove(d.value)} />
              </Field>
              <Field label={t('Tolerance above')}>
                <Input type="number" value={toleranceAbove} onChange={(_, d) => setToleranceAbove(d.value)} />
              </Field>
              <Field label={t('Target below')}>
                <Input type="number" value={targetBelow} onChange={(_, d) => setTargetBelow(d.value)} />
              </Field>
              <Field label={t('Tolerance below')}>
                <Input type="number" value={toleranceBelow} onChange={(_, d) => setToleranceBelow(d.value)} />
              </Field>
            </div>
          ) : (
            <div className={styles.row}>
              <Field label={t('Target')}>
                <Input type="number" value={target} onChange={(_, d) => setTarget(d.value)} />
              </Field>
              <Field label={t('Tolerance')}>
                <Input type="number" value={tolerance} onChange={(_, d) => setTolerance(d.value)} />
              </Field>
            </div>
          )}
          {createSetpoint.isError && <ErrorState error={createSetpoint.error} />}
          <Button appearance="primary" onClick={submit} disabled={!validFrom || createSetpoint.isPending}>
            {createSetpoint.isPending ? t('Creating…') : t('Create')}
          </Button>
        </div>
      )}

      {setpointsQuery.isLoading && <LoadingState label="" />}
      {setpointsQuery.data && setpointsQuery.data.length === 0 && <EmptyState title={t('No setpoints configured')} />}
      {setpointsQuery.data && setpointsQuery.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t('Valid from')}</TableHeaderCell>
              <TableHeaderCell>{t('Valid to')}</TableHeaderCell>
              <TableHeaderCell>{bidirectional ? 'Above / Below' : t('Target ± Tolerance')}</TableHeaderCell>
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

      {isAdmin && setpointsQuery.data && setpointsQuery.data.length > 0 && (
        <div>
          <Button icon={<Delete24Regular />} onClick={() => setDeleteOpen(true)}>
            {t('Delete setpoints…')}</Button>
          {deleteOpen && (
            <DeleteSetpointsDialog
              deviceId={deviceId}
              sensorId={sensorId}
              setpoints={setpointsQuery.data}
              open={deleteOpen}
              onClose={() => setDeleteOpen(false)}
            />
          )}
        </div>
      )}
    </Card>
  );
}

/** A required dropdown that starts on a prompt and only offers values the system knows. */
function ChoiceField({
  label,
  hint,
  value,
  onChange,
  options,
  prompt = 'Choose…',
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  prompt?: string;
}) {
  return (
    <Field label={label} required hint={hint}>
      <Select value={value} onChange={(_, d) => onChange(d.value)}>
        <option value="">{prompt}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function NewPolicyForm({ deviceId, sensorId }: { deviceId: number; sensorId: number }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const create = useCreateAggregationPolicy(deviceId, sensorId);
  const [showForm, setShowForm] = useState(false);
  const [timeScale, setTimeScale] = useState('');
  const [aggregationFunction, setAggregationFunction] = useState('');
  const [scale, setScale] = useState('');
  const [lookback, setLookback] = useState('');
  const [minIssueScore, setMinIssueScore] = useState('');
  const [minEvaluation, setMinEvaluation] = useState('');
  const [calculate, setCalculate] = useState(true);

  const reset = () => {
    setTimeScale('');
    setAggregationFunction('');
    setScale('');
    setLookback('');
    setMinIssueScore('');
    setMinEvaluation('');
    setCalculate(true);
  };

  const canSubmit = timeScale.trim() !== '' && aggregationFunction.trim() !== '' && scale.trim() !== '' && Number(lookback) > 0 && minEvaluationValid(minEvaluation);

  const submit = async () => {
    const body: CreateAggregationPolicyRequest = {
      // Only measured values are aggregated: target and tolerance are Setpoint configuration, not a data key, and the same
      // rule applies at every level. The API would accept other keys (Analysed, Anomaly, ...), but nothing here needs them.
      sourceDataKey: SOURCE_DATA_KEY,
      timeScale,
      aggregationFunction,
      scale,
      lookback: Number(lookback),
      minIssueScore: minIssueScore ? Number(minIssueScore) : undefined,
      minEvaluationPercent: minEvaluation !== '' ? Number(minEvaluation) : undefined,
      calculationEnabled: calculate,
    };
    await create.mutateAsync(body);
    toast.success(t('Aggregation level created'));
    reset();
    setShowForm(false);
  };

  if (!showForm) {
    return (
      <Button icon={<AddCircle24Regular />} onClick={() => setShowForm(true)} style={{ marginBottom: tokens.spacingVerticalM }}>
        {t('Add aggregation level')}</Button>
    );
  }

  return (
    <Card className={styles.card}>
      <Body1Strong>{t('New aggregation level')}</Body1Strong>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
        {t('Aggregates the measured values. The Sensor\'s target and tolerance are not aggregated: for each time slice the setpoint that was in effect for the larger part of the slice applies.')}</Text>
      <div className={styles.row}>
        <ChoiceField label={t('Time scale')} hint={t('The length of one aggregated slice')} value={timeScale} onChange={setTimeScale} options={TIME_SCALE_OPTIONS} />
        <ChoiceField label={t('Aggregation function')} hint={t('How the values of one slice are combined')} value={aggregationFunction} onChange={setAggregationFunction} options={AGGREGATION_FUNCTION_OPTIONS} />
      </div>
      <div className={styles.row}>
        <Field label={t('Lookback')} required hint={t('Must be greater than zero')}>
          <Input type="number" min="1" value={lookback} onChange={(_, d) => setLookback(d.value)} />
        </Field>
        <ChoiceField label={t('Scale')} hint={t('The unit of Lookback')} value={scale} onChange={setScale} options={SCALE_OPTIONS} />
        <Field label={t('Min issue score')} hint={t('Defaults to 1')}>
          <Input type="number" value={minIssueScore} onChange={(_, d) => setMinIssueScore(d.value)} />
        </Field>
        <Field label={t('Minimum evaluation (%)')} hint={t('The running slice is evaluated for anomalies only once it covers this share of its length. Defaults to 10')} validationState={minEvaluationValid(minEvaluation) ? 'none' : 'error'} validationMessage={minEvaluationValid(minEvaluation) ? undefined : t('A whole number from 0 to 100')}>
          <Input type="number" min="0" max="100" value={minEvaluation} placeholder={String(DEFAULT_MIN_EVALUATION_PERCENT)} onChange={(_, d) => setMinEvaluation(d.value)} />
        </Field>
        <Field label={t('Calculate')} hint={t('Off: the level is only aggregated, to look at the data - no anomaly, no Issue from it')}>
          <Switch checked={calculate} onChange={(_, d) => setCalculate(d.checked)} label={calculate ? t('On') : t('Off')} />
        </Field>
      </div>
      {create.isError && <ErrorState error={create.error} />}
      <div style={{ display: 'flex', gap: tokens.spacingHorizontalM }}>
        <Button appearance="primary" onClick={submit} disabled={!canSubmit || create.isPending}>
          {create.isPending ? t('Creating…') : t('Create')}
        </Button>
        <Button
          appearance="secondary"
          onClick={() => {
            reset();
            setShowForm(false);
          }}
        >
          {t('Cancel')}</Button>
      </div>
    </Card>
  );
}

export function SensorPoliciesPage() {
  const t = useT();
  const { deviceId, sensorId } = useParams<{ deviceId: string; sensorId: string }>();
  const dId = Number(deviceId);
  const sId = Number(sensorId);
  const { isAdmin } = useAuth();

  const sensorQuery = useSensor(dId, sId);
  const policiesQuery = useAggregationPolicies(dId, sId);

  if (sensorQuery.isLoading || policiesQuery.isLoading) return <LoadingState label={t('Loading policies…')} />;
  if (sensorQuery.isError) return <ErrorState error={sensorQuery.error} />;
  if (policiesQuery.isError) return <ErrorState error={policiesQuery.error} onRetry={() => policiesQuery.refetch()} />;

  return (
    <>
      <PageHeader
        title={t('{0} · Sensor configuration', sensorQuery.data?.name || sensorQuery.data?.externalSensorId)}
        titleDisplay="compact"
        description={`${sensorQuery.data?.direction ?? ''} ${sensorQuery.data?.sensorType ? '· ' + sensorQuery.data.sensorType : ''}`}
      />

      {sensorQuery.data && <MetricDefinitionCard sensor={sensorQuery.data} />}

      <Body1Strong style={{ display: 'block', marginBottom: tokens.spacingVerticalS }}>{t('Aggregation policies')}</Body1Strong>
      {isAdmin && <NewPolicyForm deviceId={dId} sensorId={sId} />}
      {policiesQuery.data && policiesQuery.data.length === 0 && <EmptyState title={t('No aggregation policies')} />}
      {policiesQuery.data?.map((policy) => (
        <PolicyCard key={policy.id} deviceId={dId} sensorId={sId} policy={policy} />
      ))}

      {sensorQuery.data && (
        <SetpointsCard deviceId={dId} sensorId={sId} bidirectional={sensorQuery.data.direction === 'bidirectional'} />
      )}
    </>
  );
}
