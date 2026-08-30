import { useState } from 'react';
import { Card, Text, Body1Strong, Checkbox, makeStyles, tokens } from '@fluentui/react-components';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { useAppToast } from '@/components/ToastProvider';
import { useReaders, useReaderDeviceGrants, useReaderEffectiveAccess, useGrantReaderDevices, useRevokeReaderDeviceGrant } from '@/api/hooks/company';
import { useDevices } from '@/api/hooks/devices';

const useStyles = makeStyles({
  layout: { display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: tokens.spacingHorizontalL },
  readerRow: { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, cursor: 'pointer', borderRadius: tokens.borderRadiusMedium },
  readerRowSelected: { background: tokens.colorBrandBackground2 },
  card: { padding: tokens.spacingVerticalM },
});

export function ReadersPage() {
  const styles = useStyles();
  const toast = useAppToast();
  const readersQuery = useReaders();
  const devicesQuery = useDevices();
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>();

  const grantsQuery = useReaderDeviceGrants(selectedUserId);
  const effectiveQuery = useReaderEffectiveAccess(selectedUserId);
  const grant = useGrantReaderDevices(selectedUserId ?? -1);
  const revoke = useRevokeReaderDeviceGrant(selectedUserId ?? -1);

  if (readersQuery.isLoading) return <LoadingState label="Loading readers…" />;
  if (readersQuery.isError) return <ErrorState error={readersQuery.error} onRetry={() => readersQuery.refetch()} />;

  const readers = readersQuery.data ?? [];
  const devices = devicesQuery.data ?? [];
  const grantedIds = new Set((grantsQuery.data ?? []).map((g) => g.deviceId));

  return (
    <>
      <PageHeader title="Readers & Access" description="Company Readers and their explicit per-Device grants." />
      <div className={styles.layout}>
        <Card className={styles.card}>
          {readers.length === 0 && <EmptyState title="No Readers yet" />}
          {readers.map((reader) => (
            <div
              key={reader.userId}
              className={`${styles.readerRow} ${selectedUserId === reader.userId ? styles.readerRowSelected : ''}`}
              onClick={() => setSelectedUserId(reader.userId)}
            >
              <Text weight="semibold">{reader.displayName}</Text>
              <br />
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {reader.email}
              </Text>
            </div>
          ))}
        </Card>

        <div>
          {selectedUserId === undefined && <EmptyState title="Select a Reader to manage their Device access" />}
          {selectedUserId !== undefined && (
            <Card className={styles.card}>
              <Body1Strong>Direct Device grants</Body1Strong>
              {grantsQuery.isLoading && <LoadingState label="" />}
              {devices.map((device) => (
                <Checkbox
                  key={device.id}
                  label={device.deviceName || device.externalDeviceId}
                  checked={grantedIds.has(device.id!)}
                  onChange={(_, d) => {
                    const deviceLabel = device.deviceName || device.externalDeviceId;
                    if (d.checked) {
                      grant.mutate([device.id!], { onSuccess: () => toast.success(`Access granted: ${deviceLabel}`) });
                    } else {
                      revoke.mutate(device.id!, { onSuccess: () => toast.success(`Access revoked: ${deviceLabel}`) });
                    }
                  }}
                />
              ))}
              {grant.isError && <ErrorState error={grant.error} />}
              {revoke.isError && <ErrorState error={revoke.error} />}

              <Body1Strong style={{ marginTop: tokens.spacingVerticalM, display: 'block' }}>
                Effective access (includes group/location-derived)
              </Body1Strong>
              {effectiveQuery.data && (
                <Text size={200}>
                  {effectiveQuery.data.isCompanyAdmin ? 'Company Admin (all Devices)' : `${(effectiveQuery.data.accessibleDeviceIds ?? []).length} Device(s)`}
                </Text>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
