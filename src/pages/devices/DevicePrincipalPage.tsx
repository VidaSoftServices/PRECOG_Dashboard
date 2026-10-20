import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button,
  Card,
  Text,
  Body1Strong,
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Field,
  Input,
  Switch,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Copy24Regular, ShieldKeyhole24Regular, ArrowClockwise24Regular, DismissCircle24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EnabledPill } from '@/components/StatusPill';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import {
  useDevicePrincipal,
  useProvisionDevicePrincipal,
  useRotateDevicePrincipalCredential,
  useRevokeDevicePrincipalCredential,
  useSetDevicePrincipalEnabled,
  type ProvisionDevicePrincipalResponse,
} from '@/api/hooks/devicePrincipal';
import { formatDateTimeWithZone, formatRelative } from '@/lib/dateTime';
import { MAX_EXACT_ID, formatInt64Id } from '@/lib/ids';

const useStyles = makeStyles({
  secretBox: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  card: {
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalL,
  },
  fields: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    marginTop: tokens.spacingVerticalM,
  },
});

/**
 * A labelled, read-only value with its own Copy button - the shape of the Secret field, reused for the ids so all three
 * look and behave the same. The value is only ever passed in by the caller; nothing is stored here beyond the "copied"
 * flag, and nothing is written anywhere except the clipboard the user asked for.
 */
function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const styles = useStyles();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      // No clipboard permission / insecure context: say so instead of pretending, the value stays selectable.
      setState('failed');
    }
  };

  return (
    <Field label={label} hint={hint}>
      <div className={styles.secretBox}>
        <Input value={value} readOnly style={{ flex: 1, fontFamily: 'monospace' }} />
        <Button icon={<Copy24Regular />} onClick={copy} aria-label={`Copy ${label}`}>
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
        </Button>
      </div>
    </Field>
  );
}

/**
 * An id (the DevicePrincipal's, the Device's) as plain digits with a Copy button. Ids are NOT secrets and do not change on
 * rotation. An id the browser cannot hold exactly (beyond 2^53 - 1, rounded by JSON parsing before it reaches this
 * component) is never shown: showing rounded digits would be showing a wrong id, so the user is told instead.
 */
function IdField({ label, value, hint }: { label: string; value: number | null | undefined; hint?: string }) {
  const id = formatInt64Id(value);
  if (!id.exact) {
    return (
      <Field label={label} validationState="error" validationMessage={`This id is larger than ${MAX_EXACT_ID}, which the dashboard cannot show exactly. Read it from the API response instead.`}>
        <Input value="" readOnly />
      </Field>
    );
  }
  return <CopyField label={label} value={id.text} hint={hint} />;
}

/**
 * The raw Secret is held ONLY in this component's local state, for exactly
 * as long as the dialog is open. It is never written to React Query cache,
 * localStorage, sessionStorage, a URL, or any log - see the modernization
 * audit's DevicePrincipal security requirement.
 */
function SecretRevealDialog({
  secret,
  deviceId,
  onClose,
}: {
  secret: ProvisionDevicePrincipalResponse | null;
  /** The Device this credential belongs to (from the page's route). */
  deviceId: number;
  onClose: () => void;
}) {
  const styles = useStyles();

  return (
    <Dialog open={secret !== null} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Device credential issued</DialogTitle>
          <DialogContent>
            <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalM }}>
              <MessageBarBody>
                <MessageBarTitle>This is shown exactly once</MessageBarTitle>
                Copy this Secret to the Device now. It cannot be retrieved again after you close this dialog - only
                metadata (creation time, last used) will remain visible.
              </MessageBarBody>
            </MessageBar>
            <div className={styles.fields}>
              <CopyField label="Secret" value={secret?.secret ?? ''} />
              <IdField label="Principal ID" value={secret?.principalId} hint="Not a secret - it stays the same when the credential is rotated." />
              <IdField label="Device ID" value={deviceId} />
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>
              Done
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export function DevicePrincipalPage() {
  const styles = useStyles();
  const toast = useAppToast();
  const { deviceId } = useParams<{ deviceId: string }>();
  const id = Number(deviceId);

  const principalQuery = useDevicePrincipal(id);
  const provision = useProvisionDevicePrincipal(id);
  const rotate = useRotateDevicePrincipalCredential(id);
  const revoke = useRevokeDevicePrincipalCredential(id);
  const setEnabled = useSetDevicePrincipalEnabled(id);

  const [revealedSecret, setRevealedSecret] = useState<ProvisionDevicePrincipalResponse | null>(null);
  const [revokeTargetId, setRevokeTargetId] = useState<number | null>(null);

  if (principalQuery.isLoading) return <LoadingState label="Loading machine identity…" />;
  if (principalQuery.isError) return <ErrorState error={principalQuery.error} onRetry={() => principalQuery.refetch()} />;

  const principal = principalQuery.data;

  return (
    <>
      <PageHeader title="DevicePrincipal administration" description="Machine identity and credentials for this Device. Admin only." />

      {!principal && (
        <Card className={styles.card}>
          <Body1Strong>Not provisioned</Body1Strong>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            This Device has no machine-access identity yet. Provisioning issues a Secret the Device will use to
            authenticate telemetry ingestion.
          </Text>
          <Button
            appearance="primary"
            icon={<ShieldKeyhole24Regular />}
            disabled={provision.isPending}
            onClick={async () => {
              setRevealedSecret(await provision.mutateAsync());
              toast.success('DevicePrincipal provisioned');
            }}
          >
            {provision.isPending ? 'Provisioning…' : 'Provision access'}
          </Button>
          {provision.isError && <ErrorState error={provision.error} />}
        </Card>
      )}

      {principal && (
        <>
          <Card className={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <EnabledPill enabled={principal.enabled} />
                <Text size={200} style={{ marginLeft: tokens.spacingHorizontalS, color: tokens.colorNeutralForeground3 }}>
                  Last seen {formatRelative(principal.lastSeenAt)}
                </Text>
              </div>
              <Switch
                checked={principal.enabled ?? false}
                label={principal.enabled ? 'Access enabled' : 'Access disabled'}
                onChange={(_, d) =>
                  setEnabled.mutate(d.checked, {
                    onSuccess: () => toast.success(d.checked ? 'DevicePrincipal enabled' : 'DevicePrincipal disabled'),
                  })
                }
              />
            </div>
            <div className={styles.fields} style={{ marginTop: 0 }}>
              <IdField label="Principal ID" value={principal.principalId} />
              <IdField label="Device ID" value={principal.deviceId ?? id} />
            </div>
            <div style={{ display: 'flex', gap: tokens.spacingHorizontalS }}>
              <Button
                icon={<ArrowClockwise24Regular />}
                disabled={rotate.isPending || !principal.enabled}
                onClick={async () => {
                  setRevealedSecret(await rotate.mutateAsync());
                  toast.success('Credential rotated');
                }}
              >
                {rotate.isPending ? 'Rotating…' : 'Rotate credential'}
              </Button>
            </div>
          </Card>

          <Body1Strong>Credentials</Body1Strong>
          <Table style={{ marginTop: tokens.spacingVerticalS }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Created</TableHeaderCell>
                <TableHeaderCell>Last used</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(principal.credentials ?? []).map((credential) => (
                <TableRow key={credential.credentialId}>
                  <TableCell>{formatDateTimeWithZone(credential.createdAt)}</TableCell>
                  <TableCell>{formatRelative(credential.lastUsedAt)}</TableCell>
                  <TableCell>
                    {credential.revokedAt ? (
                      <Text style={{ color: tokens.colorPaletteRedForeground1 }}>
                        Revoked {formatRelative(credential.revokedAt)}
                      </Text>
                    ) : (
                      <Text style={{ color: tokens.colorPaletteGreenForeground1 }}>Active</Text>
                    )}
                  </TableCell>
                  <TableCell>
                    {!credential.revokedAt && (
                      <Button
                        size="small"
                        icon={<DismissCircle24Regular />}
                        onClick={() => setRevokeTargetId(credential.credentialId!)}
                        disabled={revoke.isPending}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <SecretRevealDialog secret={revealedSecret} deviceId={id} onClose={() => setRevealedSecret(null)} />

      <ConfirmDialog
        open={revokeTargetId !== null}
        title="Revoke this credential?"
        intent="destructive"
        confirmLabel="Revoke"
        busy={revoke.isPending}
        onConfirm={() =>
          revoke.mutate(revokeTargetId!, {
            onSuccess: () => {
              toast.success('Credential revoked');
              setRevokeTargetId(null);
            },
          })
        }
        onCancel={() => setRevokeTargetId(null)}
      >
        <Text>
          This takes effect immediately - the credential can no longer obtain a new token. If this is the Device's
          only active credential, it will be unable to authenticate until a new one is provisioned or rotated.
        </Text>
      </ConfirmDialog>
    </>
  );
}
