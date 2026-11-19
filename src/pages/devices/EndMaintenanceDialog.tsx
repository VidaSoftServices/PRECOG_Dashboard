import { useState } from 'react';
import { Checkbox, Field, MessageBar, MessageBarBody, Radio, RadioGroup, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/states/ErrorState';
import type { EndMaintenanceDetails, MaintenanceKind } from '@/api/hooks/maintenance';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  option: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  hint: { color: tokens.colorNeutralForeground3 },
  summary: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
});

export const NOTE_MAX_LENGTH = 500;

/**
 * Ending a maintenance (the user's decisions of 2026-11-19), in two steps:
 * 1. What was done: **Replacement / repair** - the machine's normal state changed, a new baseline starts (for a warm-up it is still measured against
 *    the old baseline, so a repair that went wrong shows; then only the readings after the maintenance count) - or **Minor maintenance** - the
 *    baseline stays, the charts only mark it. An optional note.
 * 2. The confirmation: what will happen, with a checkbox that must be ticked (a wrong choice makes the analysis measure against the wrong baseline).
 *    The kind can be changed later in the maintenance history; the Sensor is then recalculated from the maintenance's end.
 * Used for one Sensor and for all Sensors of a Device (`targetLabel` names them).
 */
export function EndMaintenanceDialog({
  open,
  targetLabel,
  sinceText,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  /** "1# Velocity RMS Y" or "12 Sensors". */
  targetLabel: string;
  /** Optional line under the title (e.g. since when the Sensor is in maintenance). */
  sinceText?: string;
  busy: boolean;
  error?: unknown;
  onSubmit: (details: EndMaintenanceDetails) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const styles = useStyles();
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<MaintenanceKind | null>(null);
  const [note, setNote] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const replacement = kind === 'Replacement';
  const noteTooLong = note.trim().length > NOTE_MAX_LENGTH;

  const close = () => {
    if (busy) return;
    setStep(1);
    setKind(null);
    setNote('');
    setAcknowledged(false);
    onClose();
  };

  if (step === 1)
    return (
      <ConfirmDialog
        open={open}
        title={t('End maintenance: {0}', targetLabel)}
        confirmLabel={t('Next')}
        confirmDisabled={kind === null || noteTooLong}
        onConfirm={() => setStep(2)}
        onCancel={close}
      >
        <div className={styles.body}>
          {sinceText && <Text className={styles.hint}>{sinceText}</Text>}
          <Text weight="semibold">{t('What was done on the machine?')}</Text>
          <RadioGroup aria-label={t('What was done on the machine?')} value={kind ?? ''} onChange={(_, d) => setKind(d.value as MaintenanceKind)}>
            <Radio
              value="Replacement"
              label={
                <span className={styles.option}>
                  <Text weight="semibold">{t('Replacement or repair - the machine’s normal state changed')}</Text>
                  <Text size={200} className={styles.hint}>
                    {t('For example a bearing replaced, balancing, alignment. A new baseline starts: during a warm-up the readings are still measured against the old baseline (so a repair that went wrong shows), then only the readings after the maintenance count.')}
                  </Text>
                </span>
              }
            />
            <Radio
              value="Minor"
              label={
                <span className={styles.option}>
                  <Text weight="semibold">{t('Minor maintenance - the normal state did not change')}</Text>
                  <Text size={200} className={styles.hint}>
                    {t('For example an inspection, lubrication or cleaning. The baseline stays; the charts only mark the maintenance with a blue dashed line.')}
                  </Text>
                </span>
              }
            />
          </RadioGroup>
          <Field
            label={t('Note (optional)')}
            validationState={noteTooLong ? 'error' : 'none'}
            validationMessage={noteTooLong ? t('At most {0} characters.', NOTE_MAX_LENGTH) : undefined}
          >
            <Textarea value={note} onChange={(_, d) => setNote(d.value)} resize="vertical" />
          </Field>
        </div>
      </ConfirmDialog>
    );

  return (
    <ConfirmDialog
      open={open}
      title={replacement ? t('Was it really a replacement or repair?') : t('Was it really a minor maintenance?')}
      confirmLabel={t('End maintenance')}
      cancelLabel={t('Back')}
      confirmDisabled={!acknowledged}
      busy={busy}
      onConfirm={() => void onSubmit({ kind: kind!, note: note.trim() || undefined }).then(close, () => undefined)}
      onCancel={() => {
        if (busy) return;
        setAcknowledged(false);
        setStep(1);
      }}
    >
      <div className={styles.body}>
        <div className={styles.summary}>
          <Text className={styles.hint}>{t('Sensors')}</Text>
          <Text weight="semibold">{targetLabel}</Text>
          <Text className={styles.hint}>{t('Kind')}</Text>
          <Text weight="semibold">{replacement ? t('Replacement / repair') : t('Minor maintenance')}</Text>
          {note.trim() && (
            <>
              <Text className={styles.hint}>{t('Note')}</Text>
              <Text>{note.trim()}</Text>
            </>
          )}
        </div>
        <Text>
          {replacement
            ? t('A new baseline starts now. During the warm-up (raw readings 1 day, hourly levels 3 days, daily 14 days, weekly 8 weeks, monthly 6 months) the readings are measured against the baseline before the maintenance, so a repair that went wrong raises an Issue. After it only the readings measured since the maintenance count, so a new fault shows early.')
            : t('The baseline stays: the readings are measured against the same normal state as before the maintenance. The charts mark the maintenance with a blue dashed line.')}
        </Text>
        <MessageBar intent="warning">
          <MessageBarBody>
            {t('If the kind turns out to be wrong, change it in the maintenance history: the Sensor is then recalculated from the end of this maintenance until now. Issues raised meanwhile are not deleted - you review them by hand.')}
          </MessageBarBody>
        </MessageBar>
        <Checkbox
          checked={acknowledged}
          onChange={(_, d) => setAcknowledged(d.checked === true)}
          label={replacement ? t('I understand: this changes the baseline the Sensor is measured against.') : t('I understand: the baseline of the Sensor stays as it is.')}
        />
        {error !== undefined && error !== null && <ErrorState error={error} />}
      </div>
    </ConfirmDialog>
  );
}
