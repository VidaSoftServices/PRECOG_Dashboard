import { useState } from 'react';
import { Badge, Body1Strong, Button, Card, Field, Input, MessageBar, MessageBarBody, Switch, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { AddCircle24Regular, Delete16Regular, Edit16Regular } from '@fluentui/react-icons';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { LoadingState } from '@/components/states/LoadingState';
import { useAppToast } from '@/components/ToastProvider';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  useCreatePlatformServer,
  useDeletePlatformServer,
  usePlatformServers,
  useServers,
  useUpdatePlatformServer,
  type SaveServerRequest,
  type ServerDto,
} from '@/api/hooks/servers';
import { checkServerForm, serverUrl, translateServerError, type ServerFormValues } from '@/lib/serverForm';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  card: { padding: tokens.spacingVerticalM, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, marginBottom: tokens.spacingVerticalM },
  head: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  grow: { flex: '1 1 auto' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: tokens.spacingHorizontalM },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  muted: { color: tokens.colorNeutralForeground3 },
});

/** A refusal of the API shown next to the control that caused it, translated (it is a save error, not a failed load). */
export function ServerErrorBar({ error }: { error: unknown }) {
  const t = useT();
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <MessageBar intent="error">
      <MessageBarBody>{translateServerError(message, t)}</MessageBarBody>
    </MessageBar>
  );
}

const EMPTY: ServerFormValues = { name: '', address: '', port: '', useTls: true, enabled: true, deviceIdFrom: '', deviceIdTo: '', notes: '' };

const toForm = (s: ServerDto): ServerFormValues => ({
  name: s.name ?? '',
  address: s.address ?? '',
  port: s.port == null ? '' : String(s.port),
  useTls: s.useTls ?? true,
  enabled: s.enabled ?? true,
  deviceIdFrom: s.deviceIdFrom == null ? '' : String(s.deviceIdFrom),
  deviceIdTo: s.deviceIdTo == null ? '' : String(s.deviceIdTo),
  notes: s.notes ?? '',
});

const toRequest = (f: ServerFormValues): SaveServerRequest => ({
  name: f.name.trim(),
  address: f.address.trim(),
  port: f.port.trim() === '' ? null : Number(f.port),
  useTls: f.useTls,
  enabled: f.enabled,
  deviceIdFrom: f.deviceIdFrom.trim() === '' ? null : Number(f.deviceIdFrom),
  deviceIdTo: f.deviceIdTo.trim() === '' ? null : Number(f.deviceIdTo),
  notes: f.notes.trim() === '' ? null : f.notes.trim(),
});

function ServerEditor({ companyId, initial, serverId, onDone }: { companyId: number; initial: ServerFormValues; serverId: number | null; onDone: () => void }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const create = useCreatePlatformServer(companyId);
  const update = useUpdatePlatformServer(companyId);
  const [form, setForm] = useState<ServerFormValues>(initial);
  const [submitted, setSubmitted] = useState(false);
  const problems = checkServerForm(form);
  const mutation = serverId == null ? create : update;
  const set = (patch: Partial<ServerFormValues>) => setForm((f) => ({ ...f, ...patch }));
  const shown = (key: keyof ServerFormValues) => (submitted ? problems[key] : undefined);

  const save = async () => {
    setSubmitted(true);
    if (Object.keys(problems).length > 0) return;
    if (serverId == null) await create.mutateAsync(toRequest(form));
    else await update.mutateAsync({ serverId, body: toRequest(form) });
    toast.success(serverId == null ? t('Server added') : t('Server updated'));
    onDone();
  };

  return (
    <Card className={styles.card} aria-label={serverId == null ? t('Add a server') : t('Edit server')}>
      <Body1Strong>{serverId == null ? t('Add a server') : t('Edit server')}</Body1Strong>
      <div className={styles.grid}>
        <Field label={t('Name')} required validationMessage={shown('name') ? t(shown('name')!) : undefined} validationState={shown('name') ? 'error' : 'none'}>
          <Input value={form.name} maxLength={200} onChange={(_, d) => set({ name: d.value })} />
        </Field>
        <Field
          label={t('Address')}
          required
          hint={t('Host name, DNS name or IP address - without https://, port or path.')}
          validationMessage={shown('address') ? t(shown('address')!) : undefined}
          validationState={shown('address') ? 'error' : 'none'}
        >
          <Input value={form.address} maxLength={255} onChange={(_, d) => set({ address: d.value })} />
        </Field>
        <Field label={t('Port')} validationMessage={shown('port') ? t(shown('port')!) : undefined} validationState={shown('port') ? 'error' : 'none'}>
          <Input value={form.port} inputMode="numeric" onChange={(_, d) => set({ port: d.value })} />
        </Field>
      </div>
      <div className={styles.grid}>
        <Field
          label={t('First Device id')}
          hint={t('Optional: the range of Device ids only this server creates (both ends, 1 to 32767).')}
          validationMessage={shown('deviceIdFrom') ? t(shown('deviceIdFrom')!) : undefined}
          validationState={shown('deviceIdFrom') ? 'error' : 'none'}
        >
          <Input value={form.deviceIdFrom} inputMode="numeric" onChange={(_, d) => set({ deviceIdFrom: d.value })} />
        </Field>
        <Field
          label={t('Last Device id')}
          validationMessage={shown('deviceIdTo') ? t(shown('deviceIdTo')!) : undefined}
          validationState={shown('deviceIdTo') ? 'error' : 'none'}
        >
          <Input value={form.deviceIdTo} inputMode="numeric" onChange={(_, d) => set({ deviceIdTo: d.value })} />
        </Field>
        <Field label={t('Connection')}>
          <Switch checked={form.useTls} label={form.useTls ? t('Secure (https)') : t('Not secure (http)')} onChange={(_, d) => set({ useTls: d.checked })} />
        </Field>
        <Field label={t('Status')}>
          <Switch checked={form.enabled} label={form.enabled ? t('Enabled') : t('Disabled')} onChange={(_, d) => set({ enabled: d.checked })} />
        </Field>
      </div>
      <Field label={t('Notes')} validationMessage={shown('notes') ? t(shown('notes')!) : undefined} validationState={shown('notes') ? 'error' : 'none'}>
        <Textarea value={form.notes} rows={2} onChange={(_, d) => set({ notes: d.value })} />
      </Field>
      {mutation.isError && <ServerErrorBar error={mutation.error} />}
      <div className={styles.actions}>
        <Button appearance="primary" disabled={mutation.isPending} onClick={() => void save().catch(() => undefined)}>
          {mutation.isPending ? t('Saving…') : t('Save')}
        </Button>
        <Button appearance="secondary" disabled={mutation.isPending} onClick={onDone}>
          {t('Cancel')}
        </Button>
      </div>
    </Card>
  );
}

/** One server. With `manage` (the platform administrator) it can be edited and deleted; without it (a Company's own people) it is only shown. */
function ServerCard({ server, manage }: { server: ServerDto; manage?: { companyId: number; onEdit: () => void } }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const remove = useDeletePlatformServer(manage?.companyId ?? 0);
  const [confirming, setConfirming] = useState(false);
  const hasRange = server.deviceIdFrom != null && server.deviceIdTo != null;
  const deviceCount = server.deviceCount ?? 0;
  const serverId = server.id ?? 0;

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <Body1Strong>{server.name}</Body1Strong>
        {server.isThisServer && <Badge appearance="tint" color="brand">{t('This server')}</Badge>}
        {!server.enabled && <Badge appearance="tint" color="warning">{t('Disabled')}</Badge>}
        <span className={styles.grow} />
        {manage && (
          <>
            <Button size="small" icon={<Edit16Regular />} onClick={manage.onEdit}>
              {t('Edit server')}
            </Button>
            <Button size="small" icon={<Delete16Regular />} disabled={deviceCount > 0 || remove.isPending} onClick={() => setConfirming(true)}>
              {t('Delete server')}
            </Button>
          </>
        )}
      </div>
      <Text>{serverUrl({ address: server.address ?? '', port: server.port, useTls: server.useTls ?? true })}</Text>
      <Text size={200} className={styles.muted}>
        {hasRange ? t('Device ids {0} to {1}', server.deviceIdFrom!, server.deviceIdTo!) : t('No reserved Device id range')}
        {' · '}
        {t('{0} Device(s)', deviceCount)}
      </Text>
      {manage && deviceCount > 0 && (
        <Text size={200} className={styles.muted}>
          {t('A server with Devices cannot be deleted - move its Devices to another server first.')}
        </Text>
      )}
      {server.notes && <Text size={200}>{server.notes}</Text>}
      {remove.isError && <ServerErrorBar error={remove.error} />}
      <ConfirmDialog
        open={confirming}
        title={t('Delete server')}
        confirmLabel={t('Delete server')}
        intent="destructive"
        busy={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          remove.mutate(serverId, {
            onSuccess: () => {
              setConfirming(false);
              toast.success(t('Server deleted'));
            },
            onError: () => setConfirming(false),
          })
        }
      >
        {t('Remove the server {0} from the registry? Nothing else changes.', server.name ?? '')}
      </ConfirmDialog>
    </Card>
  );
}

/**
 * The Company's PRECOG servers, read-only: a Company Admin (or Reader) sees where the Company's Devices can live, but cannot add, change or remove a server -
 * only the platform administrator (VSSSysAdmin) does, from the platform page.
 */
export function ServersTab() {
  const t = useT();
  const styles = useStyles();
  const servers = useServers();

  return (
    <>
      <Text size={200} className={styles.muted} block style={{ marginBottom: tokens.spacingVerticalM }}>
        {t('The servers of your Company. They are registered by the platform administrator; each Device says on its own page which server it lives on.')}
      </Text>
      {servers.isLoading && <LoadingState label="" />}
      {servers.isError && <ErrorState error={servers.error} />}
      {servers.data && servers.data.length === 0 && <EmptyState title={t('No servers registered yet')} />}
      {servers.data?.map((server) => <ServerCard key={server.id} server={server} />)}
    </>
  );
}

/** The servers of one Company, managed by the platform administrator (VSSSysAdmin): register by IP address or DNS name, change, delete. */
export function PlatformServers({ companyId }: { companyId: number }) {
  const t = useT();
  const styles = useStyles();
  const servers = usePlatformServers(companyId);
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  return (
    <>
      <Text size={200} className={styles.muted} block style={{ marginBottom: tokens.spacingVerticalM }}>
        {t('A Company can run any number of PRECOG servers, each with its own database. Register them here so every Device can say which server it lives on; a reserved Device id range makes sure two servers never create the same Device id.')}
      </Text>
      <div style={{ marginBottom: tokens.spacingVerticalM }}>
        <Button icon={<AddCircle24Regular />} disabled={editing === 'new'} onClick={() => setEditing('new')}>
          {t('Add a server')}
        </Button>
      </div>
      {editing === 'new' && <ServerEditor companyId={companyId} initial={EMPTY} serverId={null} onDone={() => setEditing(null)} />}
      {servers.isLoading && <LoadingState label="" />}
      {servers.isError && <ErrorState error={servers.error} />}
      {servers.data && servers.data.length === 0 && editing !== 'new' && <EmptyState title={t('No servers registered yet')} />}
      {servers.data?.map((server) =>
        editing === server.id ? (
          <ServerEditor key={server.id} companyId={companyId} initial={toForm(server)} serverId={server.id ?? null} onDone={() => setEditing(null)} />
        ) : (
          <ServerCard key={server.id} server={server} manage={{ companyId, onEdit: () => setEditing(server.id ?? null) }} />
        ),
      )}
    </>
  );
}
