import { useMemo, useState } from 'react';
import { Combobox, Option, Field, Text, tokens } from '@fluentui/react-components';
import { ConfirmDialog } from './ConfirmDialog';
import { useIssues, type IssueDto } from '@/api/hooks/issues';
import { formatDateTime } from '@/lib/dateTime';

interface MoveToCanonicalDialogProps {
  open: boolean;
  deviceId: number;
  /** The member Issue being moved - excluded from candidates, obviously. */
  memberIssueId: number;
  /** The member's current canonical Issue - excluded too, since "move" to the same group is a no-op the UI shouldn't offer. */
  currentCanonicalId: number;
  busy?: boolean;
  error?: unknown;
  onConfirm: (targetCanonicalIssueId: number) => void;
  onCancel: () => void;
}

export function issueLabel(issue: IssueDto): string {
  return `#${issue.issueKey} · ${formatDateTime(issue.measuredAtFrom)}`;
}

/**
 * Exported for unit testing - see MoveToCanonicalDialog.test.tsx. Excludes
 * the member Issue being moved and its current canonical (moving to the
 * same group is a no-op the UI shouldn't offer), then applies the search
 * query against both the Issue number and the full display label.
 */
export function filterCandidates(
  issues: IssueDto[],
  memberIssueId: number,
  currentCanonicalId: number,
  query: string,
): IssueDto[] {
  const all = issues.filter((i) => i.id !== memberIssueId && i.id !== currentCanonicalId);
  if (!query.trim()) return all;
  const needle = query.trim().toLowerCase();
  return all.filter((i) => String(i.issueKey).includes(needle) || issueLabel(i).toLowerCase().includes(needle));
}

/**
 * Replaces a raw window.prompt('...canonical Issue id?') with a bounded,
 * searchable picker. `Issue_GetIssues` with deviceId + the default
 * includeMembers=false returns exactly the right candidate set - canonical
 * Issues only, for this Device, which is precisely what a valid Move-Group
 * target must be (grouping across Devices is rejected server-side anyway,
 * but this UI shouldn't offer an invalid choice in the first place).
 */
export function MoveToCanonicalDialog({
  open,
  deviceId,
  memberIssueId,
  currentCanonicalId,
  busy,
  error,
  onConfirm,
  onCancel,
}: MoveToCanonicalDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | undefined>();

  // Canonical-only by construction (includeMembers left at its default,
  // false) - never fetches or offers a non-canonical Issue as a target,
  // since MoveGroup's own contract requires the target to be canonical.
  const candidatesQuery = useIssues(open ? deviceId : undefined, { take: 200 });

  const candidates = useMemo(
    () => filterCandidates(candidatesQuery.data ?? [], memberIssueId, currentCanonicalId, query),
    [candidatesQuery.data, query, memberIssueId, currentCanonicalId],
  );

  const selected = candidates.find((c) => c.id === selectedId);

  const handleClose = () => {
    setQuery('');
    setSelectedId(undefined);
    onCancel();
  };

  return (
    <ConfirmDialog
      open={open}
      title="Move to another canonical Issue"
      confirmLabel="Move"
      busy={busy}
      confirmDisabled={!selectedId}
      onConfirm={() => selectedId && onConfirm(selectedId)}
      onCancel={handleClose}
    >
      <Text size={200} style={{ display: 'block', marginBottom: tokens.spacingVerticalM, color: tokens.colorNeutralForeground3 }}>
        Choose the canonical Issue this member should belong to instead. Only canonical Issues on the same Device are
        valid targets.
      </Text>
      <Field label="Target canonical Issue" validationState={error ? 'error' : 'none'} validationMessage={error instanceof Error ? error.message : undefined}>
        <Combobox
          value={selected ? issueLabel(selected) : query}
          placeholder={candidatesQuery.isLoading ? 'Loading…' : 'Search by Issue number or date…'}
          disabled={candidatesQuery.isLoading}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedId(undefined);
          }}
          onOptionSelect={(_, data) => {
            setSelectedId(data.optionValue ? Number(data.optionValue) : undefined);
            setQuery('');
          }}
        >
          {candidates.length === 0 && <Option key="none" value="" disabled text="No other canonical Issues found">No other canonical Issues on this Device</Option>}
          {candidates.map((c) => (
            <Option key={c.id} value={String(c.id)} text={issueLabel(c)}>
              {issueLabel(c)}
            </Option>
          ))}
        </Combobox>
      </Field>
    </ConfirmDialog>
  );
}
