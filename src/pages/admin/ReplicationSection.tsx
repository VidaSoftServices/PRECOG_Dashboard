import { useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowSync16Regular, Copy24Regular, Key16Regular } from '@fluentui/react-icons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useAuth } from '@/auth/AuthContext';
import {
  baseUrlOfServer,
  useCreateReplicationSecret,
  useReplicaStatus,
  useRevokeReplicationSecret,
  useSyncReplicaNow,
  type ServerDto,
} from '@/api/hooks/servers';
import { getHomeBaseUrl, isBlockedByMixedContent } from '@/api/deviceRouting';
import { formatDateTime, formatRelative } from '@/lib/dateTime';
import { useT } from '@/lib/language';
import { translateServerError } from '@/lib/serverForm';

const useStyles = makeStyles({
  box: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalS,
    marginTop: tokens.spacingVerticalXS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  muted: { color: tokens.colorNeutralForeground3 },
  snippet: { fontFamily: 'monospace', width: '100%' },
});

function ErrorBar({ error }: { error: unknown }) {
  const t = useT();
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <MessageBar intent="error">
      <MessageBarBody>{translateServerError(message, t)}</MessageBarBody>
    </MessageBar>
  );
}

/** The .env lines a new replica needs. The secret is in them, so they are shown once, in this dialog, and dropped when it closes. */
export function envSnippet(server: ServerDto, secret: string, masterUrl: string): string {
  return ['Server__Role=Replica', `Server__Id=${server.id}`, `Server__MasterUrl=${masterUrl}`, `Server__ReplicationSecret=${secret}`].join('\n');
}

function SecretDialog({ server, secret, onClose }: { server: ServerDto; secret: string | null; onClose: () => void }) {
  const t = useT();
  const styles = useStyles();
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const snippet = secret ? envSnippet(server, secret, getHomeBaseUrl()) : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  };
  const close = () => {
    setCopied('idle');
    onClose();
  };

  return (
    <Dialog open={secret != null} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{t('Replication key')}</DialogTitle>
          <DialogContent>
            <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalS }}>
              <MessageBarBody>{t('This key is shown only now and is not stored. Copy it into the replica server\'s .env file; creating a new key makes this one stop working.')}</MessageBarBody>
            </MessageBar>
            <Field label={t('Settings for the .env file of the replica')} hint={t('The replica also needs the master\'s HMAC_SERVER_KEY, and Cors__AdditionalOrigins for the Dashboard\'s address.')}>
              <Textarea className={styles.snippet} readOnly rows={4} value={snippet} />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button icon={<Copy24Regular />} onClick={() => void copy()}>
              {copied === 'copied' ? t('Copied') : copied === 'failed' ? t('Copy failed') : t('Copy')}
            </Button>
            <Button appearance="primary" onClick={close}>
              {t('Close')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** What the replica itself reports, asked of the replica directly, plus the "Sync now" button. */
function ReplicaCheck({ server }: { server: ServerDto }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const [asked, setAsked] = useState(false);
  const blocked = isBlockedByMixedContent(baseUrlOfServer(server));
  const status = useReplicaStatus(server, asked && !blocked);
  const sync = useSyncReplicaNow(server);
  const data = status.data;

  if (blocked)
    return <Text size={200} className={styles.muted}>{t('The browser cannot reach this server from an https page because it is not secure (http).')}</Text>;

  return (
    <>
      <div className={styles.row}>
        <Button size="small" icon={<ArrowSync16Regular />} disabled={status.isFetching} onClick={() => (asked ? void status.refetch() : setAsked(true))}>
          {t('Check replica')}
        </Button>
        {data && data.role === 'Replica' && (
          <Button
            size="small"
            appearance="primary"
            icon={<ArrowSync16Regular />}
            disabled={sync.isPending}
            onClick={() => sync.mutate(undefined, { onSuccess: (s) => (s.lastError ? undefined : toast.success(t('The replica is synchronized'))) })}
          >
            {sync.isPending ? t('Synchronizing…') : t('Sync now')}
          </Button>
        )}
      </div>
      {status.isError && <ErrorBar error={status.error} />}
      {sync.isError && <ErrorBar error={sync.error} />}
      {data && data.role !== 'Replica' && (
        <Text size={200} className={styles.muted}>{t('This server answers as a master, not as a replica (Server__Role is not Replica).')}</Text>
      )}
      {data && data.role === 'Replica' && (
        <>
          <Text size={200}>
            {data.configured ? t('Last successful pull: {0}', data.lastSuccessAt ? `${formatRelative(data.lastSuccessAt)} (${formatDateTime(data.lastSuccessAt)})` : t('never')) : t('Not configured: the master address, the key and the server id are all needed in its .env file.')}
          </Text>
          {(data.pendingDeviceDeletions ?? 0) > 0 && (
            <Text size={200} className={styles.muted}>{t('{0} Device deletion(s) not yet told to the master', data.pendingDeviceDeletions!)}</Text>
          )}
          {data.lastError && <MessageBar intent="error"><MessageBarBody>{data.lastError}</MessageBarBody></MessageBar>}
        </>
      )}
    </>
  );
}

/**
 * The replication of one server (a replica) of the Company: the key it pulls with (the platform administrator creates and revokes it; shown once), what the master saw of its
 * last pull, and what the replica itself reports with a "Sync now". Not shown for the master itself.
 */
export function ReplicationSection({ server, manage }: { server: ServerDto; manage?: { companyId: number } }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const { isAdmin } = useAuth();
  const create = useCreateReplicationSecret(manage?.companyId ?? 0);
  const revoke = useRevokeReplicationSecret(manage?.companyId ?? 0);
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const serverId = server.id ?? 0;

  if (server.isThisServer) return null;

  return (
    <div className={styles.box}>
      <div className={styles.row}>
        <Key16Regular />
        <Text weight="semibold">{t('Replication')}</Text>
        {server.hasReplicationKey ? (
          <Badge appearance="tint" color="success">{t('Key issued')}</Badge>
        ) : (
          <Badge appearance="tint" color="informative">{t('No key')}</Badge>
        )}
        {server.hasReplicationKey && server.replicationLastPullAt && (
          <Badge appearance="tint" color={server.replicationInSync ? 'success' : 'warning'}>
            {server.replicationInSync ? t('Up to date') : t('Behind')}
          </Badge>
        )}
      </div>
      <Text size={200} className={styles.muted}>
        {!server.hasReplicationKey
          ? t('Without a key this server cannot pull users, roles and Devices from the master.')
          : server.replicationLastPullAt
            ? t('Last pull seen by the master: {0}', formatRelative(server.replicationLastPullAt))
            : t('The master has not seen a pull from this server since it started.')}
        {server.hasReplicationKey && server.replicationKeyCreatedAt ? ` · ${t('Key created {0}', formatDateTime(server.replicationKeyCreatedAt))}` : ''}
      </Text>
      {server.replicationLastError && (
        <MessageBar intent="error"><MessageBarBody>{server.replicationLastError}</MessageBarBody></MessageBar>
      )}
      {manage && (
        <div className={styles.row}>
          <Button
            size="small"
            icon={<Key16Regular />}
            disabled={create.isPending}
            onClick={() => create.mutate(serverId, { onSuccess: (r) => setSecret(r.secret ?? null) })}
          >
            {server.hasReplicationKey ? t('Create a new key') : t('Create replication key')}
          </Button>
          {server.hasReplicationKey && (
            <Button size="small" disabled={revoke.isPending} onClick={() => setRevoking(true)}>
              {t('Revoke key')}
            </Button>
          )}
        </div>
      )}
      {create.isError && <ErrorBar error={create.error} />}
      {revoke.isError && <ErrorBar error={revoke.error} />}
      {(manage || isAdmin) && server.enabled && <ReplicaCheck server={server} />}
      <SecretDialog
        server={server}
        secret={secret}
        onClose={() => {
          setSecret(null);
          create.reset();
        }}
      />
      <ConfirmDialog
        open={revoking}
        title={t('Revoke key')}
        confirmLabel={t('Revoke key')}
        intent="destructive"
        busy={revoke.isPending}
        onCancel={() => setRevoking(false)}
        onConfirm={() =>
          revoke.mutate(serverId, {
            onSuccess: () => {
              setRevoking(false);
              toast.success(t('Replication key revoked'));
            },
            onError: () => setRevoking(false),
          })
        }
      >
        {t('The server {0} can no longer pull from the master. It keeps working from the last data it received.', server.name ?? '')}
      </ConfirmDialog>
    </div>
  );
}
