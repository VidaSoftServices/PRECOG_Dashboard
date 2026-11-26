import { useEffect, useRef, useState } from 'react';
import { Badge, Body1Strong, Button, Card, Field, Select, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowDownload16Regular, Delete16Regular, PlayCircle16Regular, StopRegular } from '@fluentui/react-icons';
import { useDeviceDebug, useSetDeviceDebug } from '@/api/hooks/deviceDebug';
import { useAppToast } from '@/components/ToastProvider';
import { ErrorState } from '@/components/states/ErrorState';
import { downloadTextFile } from '@/lib/downloadFile';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  card: { marginTop: tokens.spacingVerticalL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  muted: { color: tokens.colorNeutralForeground3 },
  controls: { display: 'flex', gap: tokens.spacingHorizontalM, alignItems: 'flex-end', flexWrap: 'wrap' },
  log: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    margin: 0,
    maxHeight: '420px',
    overflowY: 'auto',
    padding: tokens.spacingVerticalS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
});

const DURATIONS_MINUTES = [30, 60, 180, 360] as const;

function timeOf(at?: string): string {
  if (!at) return '';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour12: false });
}

/**
 * The remote debug log (Admin only, docs/features/firmware-update.md): switches the Device's debug mode on for a while and shows the console text the Device
 * posts. The Device only ever connects outwards - it learns of the switch from its heartbeat (about 30 seconds) and posts the text itself. The text lives in
 * the API's memory only, at most the newest 1000 lines; nothing is stored in a database.
 */
export function DebugLogCard({ deviceId, deviceLabel }: { deviceId: number; deviceLabel: string }) {
  const s = useStyles();
  const t = useT();
  const toast = useAppToast();
  const debug = useDeviceDebug(deviceId);
  const setDebug = useSetDeviceDebug(deviceId);
  const [minutes, setMinutes] = useState<number>(60);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [debug.lines.length]);

  const text = debug.lines.map((l) => `${timeOf(l.at)} ${l.text}`).join('\n');
  const minutesLeft = Math.max(1, Math.ceil(debug.secondsLeft / 60));

  const turnOn = () => {
    debug.reset();
    setDebug.mutate(minutes, { onSuccess: () => toast.success(t('Debug mode on: the Device starts sending its console text with its next heartbeat')) });
  };
  const turnOff = () => setDebug.mutate(0, { onSuccess: () => toast.success(t('Debug mode off')) });

  return (
    <Card className={s.card} aria-label={t('Debug log')}>
      <div className={s.header}>
        <Body1Strong>{t('Debug log')}</Body1Strong>
        {debug.active ? (
          <Badge appearance="filled" color="warning" icon={<PlayCircle16Regular />}>
            {t('On, {0} min left', minutesLeft)}
          </Badge>
        ) : (
          <Badge appearance="tint" color="informative">
            {t('Off')}
          </Badge>
        )}
      </div>
      <Text size={200} className={s.muted}>
        {t('While the debug mode is on, the Device sends a copy of the text it writes to its console. The Device only connects outwards: it learns of the switch from its heartbeat (about 30 seconds) and posts the text itself. The text is kept in the API\'s memory only (nothing is stored in a database), at most the newest 1000 lines, and it ends with the debug mode.')}
      </Text>

      <div className={s.controls}>
        <Field label={t('Debug mode for')}>
          <Select value={String(minutes)} onChange={(_, d) => setMinutes(Number(d.value))} disabled={debug.active} aria-label={t('Debug mode for')}>
            {DURATIONS_MINUTES.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? t('{0} minutes', m) : m === 60 ? t('1 hour') : t('{0} hours', m / 60)}
              </option>
            ))}
          </Select>
        </Field>
        {debug.active ? (
          <Button icon={<StopRegular />} onClick={turnOff} disabled={setDebug.isPending}>
            {t('Switch off')}
          </Button>
        ) : (
          <Button appearance="primary" icon={<PlayCircle16Regular />} onClick={turnOn} disabled={setDebug.isPending}>
            {t('Switch on')}
          </Button>
        )}
        <Button icon={<ArrowDownload16Regular />} disabled={debug.lines.length === 0} onClick={() => downloadTextFile(`debug-${deviceLabel || deviceId}.txt`, text + '\n', 'text/plain;charset=utf-8')}>
          {t('Download')}
        </Button>
        <Button icon={<Delete16Regular />} disabled={debug.lines.length === 0} onClick={debug.clear}>
          {t('Clear the view')}
        </Button>
      </div>
      {debug.dropped > 0 && <Text size={200} className={s.muted}>{t('{0} older line(s) were dropped by the API (it keeps the newest 1000).', debug.dropped)}</Text>}

      {debug.lines.length === 0 ? (
        <Text className={s.muted}>{debug.active ? t('Waiting for the Device (its next heartbeat tells it to start)...') : t('No debug text yet.')}</Text>
      ) : (
        <pre ref={logRef} className={s.log} aria-label={t('Debug text of the Device')}>
          {text}
        </pre>
      )}
      {setDebug.isError && <ErrorState error={setDebug.error} />}
      {debug.query.isError && <ErrorState error={debug.query.error} onRetry={() => debug.query.refetch()} />}
    </Card>
  );
}
