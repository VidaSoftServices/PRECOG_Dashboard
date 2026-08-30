import { useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Card,
  Text,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  type TableColumnDefinition,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Field,
  Select,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddCircle24Regular, Search24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { EnabledPill, FreshnessPill } from '@/components/StatusPill';
import { useAppToast } from '@/components/ToastProvider';
import { useDevices, useCreateDevice, type DeviceDto } from '@/api/hooks/devices';
import { freshnessOf, formatRelative } from '@/lib/dateTime';
import { useAuth } from '@/auth/AuthContext';
import { useBreakpoint } from '@/lib/useMediaQuery';
import { activateProps } from '@/lib/useActivateProps';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
    flexWrap: 'wrap',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  deviceCard: {
    padding: tokens.spacingVerticalM,
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  formGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
});

function NewDeviceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const styles = useStyles();
  const toast = useAppToast();
  const createDevice = useCreateDevice();
  const [externalDeviceId, setExternalDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [applicationMode, setApplicationMode] = useState<'continuous' | 'periodic'>('continuous');

  const submit = async () => {
    await createDevice.mutateAsync({ externalDeviceId, deviceName: deviceName || undefined, applicationMode });
    toast.success('Device created');
    setExternalDeviceId('');
    setDeviceName('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Add Device</DialogTitle>
          <DialogContent className={styles.formGrid}>
            <Field label="External Device ID" required hint="A unique identifier for this Device in your fleet.">
              <Input value={externalDeviceId} onChange={(_, d) => setExternalDeviceId(d.value)} />
            </Field>
            <Field label="Name">
              <Input value={deviceName} onChange={(_, d) => setDeviceName(d.value)} />
            </Field>
            <Field label="Mode" required hint="Fixed once created - every Sensor added later inherits it.">
              <Select value={applicationMode} onChange={(_, d) => setApplicationMode(d.value as 'continuous' | 'periodic')}>
                <option value="continuous">Continuous</option>
                <option value="periodic">Periodic</option>
              </Select>
            </Field>
            {createDevice.isError && <ErrorState error={createDevice.error} />}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button appearance="primary" disabled={!externalDeviceId || createDevice.isPending} onClick={submit}>
              {createDevice.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export function DeviceListPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const { isAdmin } = useAuth();
  const devicesQuery = useDevices();
  const [filter, setFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    const devices = devicesQuery.data ?? [];
    if (!filter.trim()) return devices;
    const needle = filter.trim().toLowerCase();
    return devices.filter(
      (d) => d.deviceName?.toLowerCase().includes(needle) || d.externalDeviceId?.toLowerCase().includes(needle),
    );
  }, [devicesQuery.data, filter]);

  const columns: TableColumnDefinition<DeviceDto>[] = useMemo(
    () => [
      createTableColumn<DeviceDto>({
        columnId: 'name',
        compare: (a, b) => (a.deviceName ?? '').localeCompare(b.deviceName ?? ''),
        renderHeaderCell: () => 'Device',
        renderCell: (device) => (
          <div>
            <Text weight="semibold">{device.deviceName || device.externalDeviceId}</Text>
            <br />
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {device.externalDeviceId}
            </Text>
          </div>
        ),
      }),
      createTableColumn<DeviceDto>({
        columnId: 'mode',
        renderHeaderCell: () => 'Mode',
        renderCell: (device) => <Text>{device.applicationMode}</Text>,
      }),
      createTableColumn<DeviceDto>({
        columnId: 'heartbeat',
        renderHeaderCell: () => 'Last heartbeat',
        renderCell: (device) => (
          <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center' }}>
            <FreshnessPill freshness={freshnessOf(device.heartBeat)} />
            <Text size={200}>{formatRelative(device.heartBeat)}</Text>
          </div>
        ),
      }),
      createTableColumn<DeviceDto>({
        columnId: 'enabled',
        renderHeaderCell: () => 'Status',
        renderCell: (device) => <EnabledPill enabled={device.enabled} />,
      }),
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Devices"
        description="Devices accessible to you within your Company."
        actions={
          isAdmin && (
            <Button appearance="primary" icon={<AddCircle24Regular />} onClick={() => setDialogOpen(true)}>
              Add Device
            </Button>
          )
        }
      />

      <div className={styles.toolbar}>
        <Input
          contentBefore={<Search24Regular />}
          placeholder="Filter by name or ID…"
          value={filter}
          onChange={(_, d) => setFilter(d.value)}
          style={{ minWidth: '260px' }}
        />
      </div>

      {devicesQuery.isLoading && <LoadingState label="Loading devices…" />}
      {devicesQuery.isError && <ErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />}

      {devicesQuery.isSuccess && filtered.length === 0 && (
        <EmptyState title="No devices found" description={filter ? 'Try a different filter.' : 'No Devices are accessible to you yet.'} />
      )}

      {devicesQuery.isSuccess && filtered.length > 0 && breakpoint === 'desktop' && (
        <DataGrid items={filtered} columns={columns} getRowId={(item) => item.id} resizableColumns>
          <DataGridHeader>
            <DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
          </DataGridHeader>
          <DataGridBody<DeviceDto>>
            {({ item, rowId }) => (
              <DataGridRow<DeviceDto>
                key={rowId}
                onClick={() => navigate(`/devices/${item.id}`)}
                onKeyDown={(e: KeyboardEvent) => {
                  // DataGrid's own grid semantics already provide cell-level
                  // Tab/arrow-key navigation - this only adds row activation,
                  // it doesn't replace the grid's built-in keyboard support.
                  if (e.key === 'Enter') navigate(`/devices/${item.id}`);
                }}
                style={{ cursor: 'pointer' }}
              >
                {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      )}

      {devicesQuery.isSuccess && filtered.length > 0 && breakpoint !== 'desktop' && (
        <div className={styles.cardList}>
          {filtered.map((device) => (
            <Card key={device.id} className={styles.deviceCard} {...activateProps(() => navigate(`/devices/${device.id}`))}>
              <div>
                <Text weight="semibold">{device.deviceName || device.externalDeviceId}</Text>
                <br />
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {device.applicationMode} · {formatRelative(device.heartBeat)}
                </Text>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, alignItems: 'flex-end' }}>
                <EnabledPill enabled={device.enabled} />
                <FreshnessPill freshness={freshnessOf(device.heartBeat)} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewDeviceDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
