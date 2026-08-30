import { useState } from 'react';
import { Card, Text, Button, Input, Field, Switch, Select, makeStyles, tokens } from '@fluentui/react-components';
import { AddCircle24Regular, MergeRegular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EnabledPill } from '@/components/StatusPill';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import {
  useIssueCategories,
  useCreateIssueCategory,
  useSetIssueCategoryEnabled,
  useMergeIssueCategory,
} from '@/api/hooks/issueCategories';

const useStyles = makeStyles({
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
  },
  formGrid: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

export function CategoriesPage() {
  const styles = useStyles();
  const toast = useAppToast();
  const categoriesQuery = useIssueCategories(true);
  const createCategory = useCreateIssueCategory();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [mergeTarget, setMergeTarget] = useState<number | undefined>();
  const mergeCategory = useMergeIssueCategory(mergingId ?? -1);

  if (categoriesQuery.isLoading) return <LoadingState label="Loading categories…" />;
  if (categoriesQuery.isError) return <ErrorState error={categoriesQuery.error} onRetry={() => categoriesQuery.refetch()} />;

  const categories = categoriesQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Categories"
        description="Company-scoped Issue category catalog."
        actions={
          <Button icon={<AddCircle24Regular />} onClick={() => setDialogOpen(true)}>
            New category
          </Button>
        }
      />

      <Card>
        {categories.map((category) => (
          <div key={category.id} className={styles.row}>
            <div>
              <Text weight="semibold">{category.name}</Text>
              {category.description && (
                <Text size={200} style={{ display: 'block', color: tokens.colorNeutralForeground3 }}>
                  {category.description}
                </Text>
              )}
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {category.assignedIssueCount ?? 0} issue(s)
              </Text>
            </div>
            <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center' }}>
              <EnabledPill enabled={category.enabled} />
              <Button
                size="small"
                icon={<MergeRegular />}
                onClick={() => {
                  setMergingId(category.id!);
                  setMergeTarget(undefined);
                }}
              >
                Merge
              </Button>
              <UseSetEnabledSwitch categoryId={category.id!} enabled={category.enabled ?? false} categoryName={category.name ?? 'category'} />
            </div>
          </div>
        ))}
      </Card>

      <ConfirmDialog
        open={dialogOpen}
        title="New category"
        confirmLabel="Create"
        busy={createCategory.isPending}
        confirmDisabled={!name}
        onConfirm={async () => {
          await createCategory.mutateAsync({ name, description: description || undefined });
          toast.success('Category created');
          setName('');
          setDescription('');
          setDialogOpen(false);
        }}
        onCancel={() => setDialogOpen(false)}
      >
        <div className={styles.formGrid}>
          <Field label="Name" required>
            <Input value={name} onChange={(_, d) => setName(d.value)} />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(_, d) => setDescription(d.value)} />
          </Field>
          {createCategory.isError && <ErrorState error={createCategory.error} />}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={mergingId !== null}
        title="Merge category"
        confirmLabel="Merge"
        busy={mergeCategory.isPending}
        confirmDisabled={!mergeTarget}
        onConfirm={async () => {
          await mergeCategory.mutateAsync(mergeTarget!);
          toast.success('Category merged');
          setMergingId(null);
        }}
        onCancel={() => setMergingId(null)}
      >
        <div className={styles.formGrid}>
          <Text size={200}>
            Every Issue on this category will be reassigned to the target, and the source category will be retired
            (kept for audit, not deleted).
          </Text>
          <Field label="Target category">
            <Select value={mergeTarget !== undefined ? String(mergeTarget) : ''} onChange={(_, d) => setMergeTarget(Number(d.value))}>
              <option value="">Select…</option>
              {categories.filter((c) => c.id !== mergingId && c.enabled).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {mergeCategory.isError && <ErrorState error={mergeCategory.error} />}
        </div>
      </ConfirmDialog>
    </>
  );
}

function UseSetEnabledSwitch({ categoryId, enabled, categoryName }: { categoryId: number; enabled: boolean; categoryName: string }) {
  const toast = useAppToast();
  const setEnabled = useSetIssueCategoryEnabled(categoryId);
  return (
    <Switch
      checked={enabled}
      aria-label={`${categoryName} enabled`}
      onChange={(_, d) =>
        setEnabled.mutate(d.checked, { onSuccess: () => toast.success(d.checked ? 'Category enabled' : 'Category retired') })
      }
    />
  );
}
