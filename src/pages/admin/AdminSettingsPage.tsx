import { useState } from 'react';
import { Card, Text, Button, Input, Field, Select, TabList, Tab, makeStyles, tokens } from '@fluentui/react-components';
import { AddCircle24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { useAppToast } from '@/components/ToastProvider';
import { useLocations, useCreateLocation, useDeviceGroups, useCreateDeviceGroup, useDeviceClasses } from '@/api/hooks/referenceData';

const useStyles = makeStyles({
  toolbar: { display: 'flex', gap: tokens.spacingHorizontalM, marginBottom: tokens.spacingVerticalL, alignItems: 'flex-end', flexWrap: 'wrap' },
  row: { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}` },
});

const locationTypes = ['Enterprise', 'Site', 'Building', 'Floor', 'Area', 'Room', 'ProductionLine', 'WorkCell'];

function LocationsTab() {
  const styles = useStyles();
  const toast = useAppToast();
  const locationsQuery = useLocations();
  const createLocation = useCreateLocation();
  const [name, setName] = useState('');
  const [locationType, setLocationType] = useState(locationTypes[0]!);

  return (
    <>
      <div className={styles.toolbar}>
        <Field label="Name">
          <Input value={name} onChange={(_, d) => setName(d.value)} />
        </Field>
        <Field label="Type">
          <Select value={locationType} onChange={(_, d) => setLocationType(d.value)}>
            {locationTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          icon={<AddCircle24Regular />}
          disabled={!name || createLocation.isPending}
          onClick={async () => {
            await createLocation.mutateAsync({ name, locationType });
            toast.success('Location created');
            setName('');
          }}
        >
          Add
        </Button>
      </div>
      {createLocation.isError && <ErrorState error={createLocation.error} />}
      {locationsQuery.isLoading && <LoadingState label="" />}
      {locationsQuery.data && locationsQuery.data.length === 0 && <EmptyState title="No locations yet" />}
      <Card>
        {locationsQuery.data?.map((loc) => (
          <div key={loc.id} className={styles.row}>
            <Text weight="semibold">{loc.path || loc.name}</Text> <Text size={200}>({loc.locationType})</Text>
          </div>
        ))}
      </Card>
    </>
  );
}

function DeviceGroupsTab() {
  const styles = useStyles();
  const toast = useAppToast();
  const groupsQuery = useDeviceGroups();
  const createGroup = useCreateDeviceGroup();
  const [name, setName] = useState('');

  return (
    <>
      <div className={styles.toolbar}>
        <Field label="Name">
          <Input value={name} onChange={(_, d) => setName(d.value)} />
        </Field>
        <Button
          icon={<AddCircle24Regular />}
          disabled={!name || createGroup.isPending}
          onClick={async () => {
            await createGroup.mutateAsync({ name });
            toast.success('Device group created');
            setName('');
          }}
        >
          Add
        </Button>
      </div>
      {groupsQuery.isLoading && <LoadingState label="" />}
      {groupsQuery.data && groupsQuery.data.length === 0 && <EmptyState title="No Device groups yet" />}
      <Card>
        {groupsQuery.data?.map((group) => (
          <div key={group.id} className={styles.row}>
            <Text weight="semibold">{group.name}</Text> <Text size={200}>{(group.deviceIds ?? []).length} Device(s)</Text>
          </div>
        ))}
      </Card>
    </>
  );
}

function DeviceClassesTab() {
  const styles = useStyles();
  const classesQuery = useDeviceClasses();
  return (
    <>
      <Text size={200} style={{ display: 'block', marginBottom: tokens.spacingVerticalM, color: tokens.colorNeutralForeground3 }}>
        Read-only reference catalog - the API has no write operations for Device classes.
      </Text>
      {classesQuery.isLoading && <LoadingState label="" />}
      <Card>
        {classesQuery.data?.map((c) => (
          <div key={c.id} className={styles.row}>
            <Text weight="semibold">{c.name}</Text> <Text size={200}>{c.code}</Text>
          </div>
        ))}
      </Card>
    </>
  );
}

export function AdminSettingsPage() {
  const [tab, setTab] = useState('locations');
  return (
    <>
      <PageHeader title="Company Settings" description="Locations, Device groups, and the Device-class reference catalog." />
      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(String(d.value))} style={{ marginBottom: tokens.spacingVerticalL }}>
        <Tab value="locations">Locations</Tab>
        <Tab value="groups">Device groups</Tab>
        <Tab value="classes">Device classes</Tab>
      </TabList>
      {tab === 'locations' && <LocationsTab />}
      {tab === 'groups' && <DeviceGroupsTab />}
      {tab === 'classes' && <DeviceClassesTab />}
    </>
  );
}
