import { useRef, useState } from 'react';
import {
  Badge,
  Body1Strong,
  Button,
  Card,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowCircleDown16Regular,
  ArrowUndo16Regular,
  CheckmarkCircle16Regular,
  DismissCircle16Regular,
  ErrorCircle16Regular,
  Info16Regular,
  PlayCircle16Regular,
} from '@fluentui/react-icons';
import {
  useAssignFirmware,
  useDeleteFirmwareRelease,
  useDeviceFirmware,
  useUploadFirmware,
  type FirmwareReleaseDto,
} from '@/api/hooks/firmware';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { formatDateTime } from '@/lib/dateTime';
import { useT } from '@/lib/language';
import { deleteConfirmationName } from './DeleteDeviceDialog';

const useStyles = makeStyles({
  card: { marginTop: tokens.spacingVerticalL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  summary: { display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: tokens.spacingHorizontalL, rowGap: tokens.spacingVerticalXS },
  muted: { color: tokens.colorNeutralForeground3 },
  scroll: { overflowX: 'auto' },
  mono: { fontFamily: tokens.fontFamilyMonospace },
  log: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, margin: 0 },
  upload: { display: 'flex', gap: tokens.spacingHorizontalM, alignItems: 'flex-end', flexWrap: 'wrap' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
});

/** A report state as a badge: icon + text, never colour alone. */
export function FirmwareStateBadge({ state }: { state?: string | null }) {
  const t = useT();
  switch (state) {
    case 'confirmed':
      return <Badge appearance="filled" color="success" icon={<CheckmarkCircle16Regular />}>{t('Confirmed')}</Badge>;
    case 'running':
      return <Badge appearance="tint" color="informative" icon={<PlayCircle16Regular />}>{t('Running')}</Badge>;
    case 'downloading':
      return <Badge appearance="filled" color="brand" icon={<ArrowCircleDown16Regular />}>{t('Downloading')}</Badge>;
    case 'staged':
      return <Badge appearance="filled" color="brand" icon={<ArrowCircleDown16Regular />}>{t('Installing')}</Badge>;
    case 'rolledback':
      return <Badge appearance="filled" color="warning" icon={<ArrowUndo16Regular />}>{t('Rolled back')}</Badge>;
    case 'rejected':
      return <Badge appearance="filled" color="danger" icon={<DismissCircle16Regular />}>{t('Rejected')}</Badge>;
    case 'failed':
      return <Badge appearance="filled" color="danger" icon={<ErrorCircle16Regular />}>{t('Failed')}</Badge>;
    case 'checking':
      return <Badge appearance="tint" color="informative" icon={<Info16Regular />}>{t('Checking')}</Badge>;
    default:
      return <Badge appearance="outline" color="informative" icon={<Info16Regular />}>{t('No report yet')}</Badge>;
  }
}

function shortSha(sha?: string | null): string {
  return sha ? sha.slice(0, 12) : '-';
}

function kib(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

interface FirmwareCardProps {
  deviceId: number;
  device: { deviceName?: string | null; externalDeviceId?: string | null };
  isAdmin: boolean;
}

/**
 * The Device's firmware (remote update, docs/features/firmware-update.md): what it runs, what happened at its last update, the uploaded releases
 * and - for an Admin - upload, install and delete. Everyone with access to the Device sees the state. The Device checks for a new release every
 * 30 minutes, installs it, and puts the previous firmware back by itself when the new one does not get online within 10 minutes.
 */
export function FirmwareCard({ deviceId, device, isAdmin }: FirmwareCardProps) {
  const s = useStyles();
  const t = useT();
  const toast = useAppToast();
  const query = useDeviceFirmware(deviceId);
  const upload = useUploadFirmware(deviceId);
  const assign = useAssignFirmware(deviceId);
  const remove = useDeleteFirmwareRelease(deviceId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [note, setNote] = useState('');
  const [installing, setInstalling] = useState<FirmwareReleaseDto | null>(null);
  const [typedName, setTypedName] = useState('');
  const [deleting, setDeleting] = useState<FirmwareReleaseDto | null>(null);

  if (query.isLoading) return <LoadingState label={t('Loading the firmware...')} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;
  const releases = data.releases ?? [];
  const events = data.events ?? [];
  const report = data.device ?? {};
  const assigned = releases.find((r) => r.id === data.assignedReleaseId);
  const runningRelease = releases.find((r) => r.id === report.runningReleaseId);
  const waiting = assigned != null && assigned.sha256 !== report.runningSha256;
  const confirmName = deleteConfirmationName(device);
  const canUpload = isAdmin && file != null && version.trim() !== '' && !upload.isPending;

  const doUpload = () => {
    if (!file) return;
    upload.mutate(
      { file, version: version.trim(), note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t('Firmware uploaded'));
          setFile(null);
          setVersion('');
          setNote('');
          if (fileRef.current) fileRef.current.value = '';
        },
      },
    );
  };

  return (
    <Card className={s.card} aria-label={t('Firmware')}>
      <div className={s.header}>
        <Body1Strong>{t('Firmware')}</Body1Strong>
        <Text size={200} className={s.muted}>
          {t('The Device checks for a new firmware every 30 minutes. If a new firmware is not online within 10 minutes, the previous one is put back.')}
        </Text>
      </div>

      <div className={s.summary}>
        <Text className={s.muted}>{t('Running')}</Text>
        <Text>
          {report.runningVersion || t('(no version label)')}{' '}
          <span className={`${s.mono} ${s.muted}`}>{shortSha(report.runningSha256)}</span>{' '}
          {report.runningSha256 && (runningRelease ? <Text className={s.muted}>({t('uploaded release: {0}', runningRelease.version ?? '')})</Text> : <Text className={s.muted}>({t('not one of the uploaded releases')})</Text>)}
        </Text>
        <Text className={s.muted}>{t('Last report')}</Text>
        <Text>
          <FirmwareStateBadge state={report.state} /> {report.reportedAt ? formatDateTime(report.reportedAt) : ''}
        </Text>
        <Text className={s.muted}>{t('Assigned')}</Text>
        <Text>
          {assigned ? `${assigned.version} (${shortSha(assigned.sha256)})` : t('none')}{' '}
          {waiting && <Badge appearance="tint" color="brand">{t('waiting for the Device')}</Badge>}
        </Text>
      </div>

      {report.detail && (
        <details>
          <summary>{t('Log of the last report')}</summary>
          <pre className={s.log}>{report.detail}</pre>
        </details>
      )}

      {isAdmin && (
        <div className={s.upload}>
          <Field label={t('Firmware file (firmware.bin)')}>
            <input
              ref={fileRef}
              type="file"
              accept=".bin"
              aria-label={t('Firmware file (firmware.bin)')}
              onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
            />
          </Field>
          <Field label={t('Version label')}>
            <Input value={version} onChange={(_, d) => setVersion(d.value)} placeholder="1.4.2" />
          </Field>
          <Field label={t('Note (optional)')}>
            <Input value={note} onChange={(_, d) => setNote(d.value)} maxLength={500} />
          </Field>
          <Button appearance="primary" disabled={!canUpload} onClick={doUpload}>
            {upload.isPending ? t('Uploading...') : t('Upload')}
          </Button>
        </div>
      )}
      {upload.isError && <ErrorState error={upload.error} />}
      {assign.isError && <ErrorState error={assign.error} />}
      {remove.isError && <ErrorState error={remove.error} />}

      {releases.length === 0 ? (
        <Text className={s.muted}>{t('No firmware was uploaded for this Device yet.')}</Text>
      ) : (
        <div className={s.scroll}>
          <Table aria-label={t('Uploaded firmware')} size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t('Version')}</TableHeaderCell>
                <TableHeaderCell>{t('Note')}</TableHeaderCell>
                <TableHeaderCell>{t('Size')}</TableHeaderCell>
                <TableHeaderCell>SHA-256</TableHeaderCell>
                <TableHeaderCell>{t('Uploaded')}</TableHeaderCell>
                {isAdmin && <TableHeaderCell />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.version}{' '}
                    {r.id === data.assignedReleaseId && <Badge appearance="tint" color="brand">{t('assigned')}</Badge>}{' '}
                    {r.id === report.runningReleaseId && <Badge appearance="tint" color="success">{t('running')}</Badge>}
                  </TableCell>
                  <TableCell>{r.note}</TableCell>
                  <TableCell>{kib(r.sizeBytes ?? 0)}</TableCell>
                  <TableCell className={s.mono}>{shortSha(r.sha256)}</TableCell>
                  <TableCell>
                    {formatDateTime(r.uploadedAt)}
                    {r.uploadedByName ? ` - ${r.uploadedByName}` : ''}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className={s.actions}>
                        <Button size="small" appearance="primary" disabled={r.id === data.assignedReleaseId && !waiting && r.id === report.runningReleaseId} onClick={() => { setTypedName(''); setInstalling(r); }}>
                          {t('Install on this Device')}
                        </Button>
                        <Button size="small" disabled={r.id === data.assignedReleaseId} onClick={() => setDeleting(r)}>
                          {t('Delete')}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {isAdmin && assigned && (
        <div>
          <Button size="small" onClick={() => assign.mutate(null, { onSuccess: () => toast.success(t('Assignment removed')) })}>
            {t('Remove the assignment')}
          </Button>
        </div>
      )}

      {events.length > 0 && (
        <div className={s.scroll}>
          <Table aria-label={t('Reports of the Device')} size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t('Time')}</TableHeaderCell>
                <TableHeaderCell>{t('State')}</TableHeaderCell>
                <TableHeaderCell>{t('Version')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.slice(0, 10).map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{formatDateTime(e.at)}</TableCell>
                  <TableCell><FirmwareStateBadge state={e.state} /></TableCell>
                  <TableCell>{e.version} <span className={`${s.mono} ${s.muted}`}>{shortSha(e.sha256)}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={installing != null}
        title={t('Install this firmware on the Device?')}
        confirmLabel={t('Install')}
        busy={assign.isPending}
        confirmDisabled={typedName.trim() !== confirmName}
        onCancel={() => setInstalling(null)}
        onConfirm={() => {
          if (!installing) return;
          assign.mutate(installing.id ?? null, {
            onSuccess: () => {
              toast.success(t('The Device installs it at its next check (within 30 minutes)'));
              setInstalling(null);
            },
          });
        }}
      >
        <Text block>
          {t('Version {0} ({1}) is downloaded by the Device within 30 minutes, checked, installed, and the Device restarts (a minute without measurement).', installing?.version ?? '', shortSha(installing?.sha256))}
        </Text>
        <Text block>{t('If the new firmware does not get online within 10 minutes (for example a wrong configuration), the Device puts the previous firmware back and reports what happened here.')}</Text>
        <Field label={t('Type the Device name to confirm: {0}', confirmName)}>
          <Input value={typedName} onChange={(_, d) => setTypedName(d.value)} aria-label={t('Device name')} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting != null}
        title={t('Delete this firmware release?')}
        intent="destructive"
        confirmLabel={t('Delete')}
        busy={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id ?? 0, {
            onSuccess: () => {
              toast.success(t('Firmware release deleted'));
              setDeleting(null);
            },
          });
        }}
      >
        <Text block>{t('Version {0} is removed from the server. A Device that runs it is not affected.', deleting?.version ?? '')}</Text>
      </ConfirmDialog>
    </Card>
  );
}
