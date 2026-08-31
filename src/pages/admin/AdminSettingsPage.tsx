import { useState } from 'react';
import {
  Card,
  Text,
  Body1Strong,
  Button,
  Input,
  Field,
  Select,
  Badge,
  Link,
  Checkbox,
  MessageBar,
  MessageBarBody,
  TabList,
  Tab,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddCircle24Regular, Edit24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { useAppToast } from '@/components/ToastProvider';
import {
  useLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeviceGroups,
  useCreateDeviceGroup,
  useAddDeviceGroupMember,
  useRemoveDeviceGroupMember,
  useDeviceClasses,
  type LocationDto,
  type DeviceGroupDto,
} from '@/api/hooks/referenceData';
import { useCompany, useUpdateCompanyName } from '@/api/hooks/company';
import { useDevices } from '@/api/hooks/devices';
import { isSafeHttpsUrl } from '@/lib/safeExternalUrl';
import { activateProps } from '@/lib/useActivateProps';

const useStyles = makeStyles({
  toolbar: { display: 'flex', gap: tokens.spacingHorizontalM, marginBottom: tokens.spacingVerticalL, alignItems: 'flex-end', flexWrap: 'wrap' },
  row: { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: tokens.spacingHorizontalM },
  card: { padding: tokens.spacingVerticalM, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  profileHeader: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM },
  logo: { height: '48px', maxWidth: '200px', objectFit: 'contain' },
});

function CompanyProfileTab() {
  const styles = useStyles();
  const toast = useAppToast();
  const companyQuery = useCompany();
  const updateName = useUpdateCompanyName();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  if (companyQuery.isLoading) return <LoadingState label="Loading Company profile…" />;
  if (companyQuery.isError) return <ErrorState error={companyQuery.error} onRetry={() => companyQuery.refetch()} />;
  const company = companyQuery.data;
  if (!company) return <EmptyState title="Company profile unavailable" />;

  const startEdit = () => {
    setNameDraft(company.name ?? '');
    setEditingName(true);
  };

  const saveName = async () => {
    await updateName.mutateAsync(nameDraft.trim());
    toast.success('Company name updated');
    setEditingName(false);
  };

  return (
    <Card className={styles.card} style={{ maxWidth: '560px' }}>
      <div className={styles.profileHeader}>
        {isSafeHttpsUrl(company.logo) && (
          // Untrusted external image (see CLAUDE.md's Company-profile rules) - hide silently on load failure rather than showing a broken-image icon.
          <img
            src={company.logo}
            alt=""
            className={styles.logo}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <div>
          <Body1Strong>{company.name}</Body1Strong>
          <br />
          <Badge appearance="tint" color={company.profileSource === 'Local' ? 'informative' : 'subtle'}>
            {company.profileSource === 'Local' ? 'Locally managed' : 'Synchronized from WordPress'}
          </Badge>
        </div>
      </div>

      {company.website &&
        (isSafeHttpsUrl(company.website) ? (
          <Link href={company.website} target="_blank" rel="noopener noreferrer">
            {company.website}
          </Link>
        ) : (
          <Text size={200}>{company.website}</Text>
        ))}

      {editingName ? (
        <div className={styles.toolbar}>
          <Field label="Company name">
            <Input value={nameDraft} onChange={(_, d) => setNameDraft(d.value)} />
          </Field>
          <Button appearance="primary" disabled={!nameDraft.trim() || updateName.isPending} onClick={saveName}>
            {updateName.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button appearance="secondary" onClick={() => setEditingName(false)} disabled={updateName.isPending}>
            Cancel
          </Button>
        </div>
      ) : company.nameEditable ? (
        <div>
          <Button icon={<Edit24Regular />} onClick={startEdit}>
            Rename Company
          </Button>
        </div>
      ) : (
        <MessageBar intent="info">
          <MessageBarBody>
            {company.profileSource === 'MirroredDatabase'
              ? "This Company's name, logo, and website are synchronized from WordPress and can't be edited here - update them at the source instead."
              : "This Company's name can't be edited by your account."}
          </MessageBarBody>
        </MessageBar>
      )}
      {updateName.isError && <ErrorState error={updateName.error} />}
    </Card>
  );
}

function LocationRow({ location }: { location: LocationDto }) {
  const styles = useStyles();
  const toast = useAppToast();
  const updateLocation = useUpdateLocation(location.id!);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(location.name ?? '');
  const [codeDraft, setCodeDraft] = useState(location.code ?? '');

  if (!editing) {
    return (
      <div className={styles.row}>
        <div>
          <Text weight="semibold">{location.path || location.name}</Text> <Text size={200}>({location.locationType})</Text>
        </div>
        <Button
          size="small"
          icon={<Edit24Regular />}
          onClick={() => {
            setNameDraft(location.name ?? '');
            setCodeDraft(location.code ?? '');
            setEditing(true);
          }}
        >
          Edit
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <div className={styles.toolbar} style={{ marginBottom: 0 }}>
        <Field label="Location name">
          <Input value={nameDraft} onChange={(_, d) => setNameDraft(d.value)} />
        </Field>
        <Field label="Location code">
          <Input value={codeDraft} onChange={(_, d) => setCodeDraft(d.value)} />
        </Field>
        <Button
          appearance="primary"
          size="small"
          disabled={updateLocation.isPending}
          onClick={async () => {
            await updateLocation.mutateAsync({ name: nameDraft || undefined, code: codeDraft || undefined });
            toast.success('Location updated');
            setEditing(false);
          }}
        >
          {updateLocation.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button size="small" appearance="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {updateLocation.isError && <ErrorState error={updateLocation.error} />}
    </div>
  );
}

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
          <LocationRow key={loc.id} location={loc} />
        ))}
      </Card>
    </>
  );
}

function DeviceGroupMembersPanel({ group }: { group: DeviceGroupDto }) {
  const styles = useStyles();
  const toast = useAppToast();
  const devicesQuery = useDevices();
  const addMember = useAddDeviceGroupMember();
  const removeMember = useRemoveDeviceGroupMember();
  const memberIds = new Set(group.deviceIds ?? []);
  const busy = addMember.isPending || removeMember.isPending;

  return (
    <Card className={styles.card}>
      <Body1Strong>{group.name} - members</Body1Strong>
      {devicesQuery.isLoading && <LoadingState label="" />}
      {devicesQuery.data?.map((device) => {
        const label = device.deviceName || device.externalDeviceId || `Device ${device.id}`;
        return (
          <Checkbox
            key={device.id}
            label={label}
            checked={memberIds.has(device.id!)}
            disabled={busy}
            onChange={(_, d) => {
              if (d.checked === true) {
                addMember.mutate(
                  { groupId: group.id!, deviceId: device.id! },
                  { onSuccess: () => toast.success(`${label} added to ${group.name}`) },
                );
              } else {
                removeMember.mutate(
                  { groupId: group.id!, deviceId: device.id! },
                  { onSuccess: () => toast.success(`${label} removed from ${group.name}`) },
                );
              }
            }}
          />
        );
      })}
      {(addMember.isError || removeMember.isError) && <ErrorState error={addMember.error ?? removeMember.error} />}
    </Card>
  );
}

function DeviceGroupsTab() {
  const styles = useStyles();
  const toast = useAppToast();
  const groupsQuery = useDeviceGroups();
  const createGroup = useCreateDeviceGroup();
  const [name, setName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();

  const groups = groupsQuery.data ?? [];
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

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
      {groups.length === 0 && <EmptyState title="No Device groups yet" />}
      <Card style={{ marginBottom: tokens.spacingVerticalM }}>
        {groups.map((group) => (
          <div
            key={group.id}
            className={styles.row}
            style={{ cursor: 'pointer', background: selectedGroupId === group.id ? tokens.colorBrandBackground2 : undefined }}
            {...activateProps(() => setSelectedGroupId(group.id))}
          >
            <Text weight="semibold">{group.name}</Text> <Text size={200}>{(group.deviceIds ?? []).length} Device(s)</Text>
          </div>
        ))}
      </Card>
      {selectedGroup ? (
        <DeviceGroupMembersPanel group={selectedGroup} />
      ) : (
        groups.length > 0 && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Select a Device group above to manage its Device membership.
          </Text>
        )
      )}
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
  const [tab, setTab] = useState('profile');
  return (
    <>
      <PageHeader title="Company Settings" description="Company profile, Locations, Device groups, and the Device-class reference catalog." />
      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(String(d.value))} style={{ marginBottom: tokens.spacingVerticalL }}>
        <Tab value="profile">Profile</Tab>
        <Tab value="locations">Locations</Tab>
        <Tab value="groups">Device groups</Tab>
        <Tab value="classes">Device classes</Tab>
      </TabList>
      {tab === 'profile' && <CompanyProfileTab />}
      {tab === 'locations' && <LocationsTab />}
      {tab === 'groups' && <DeviceGroupsTab />}
      {tab === 'classes' && <DeviceClassesTab />}
    </>
  );
}
