import { useState } from 'react';
import { Field, Input, MessageBar, MessageBarBody, Text, tokens } from '@fluentui/react-components';
import { useDeletePlatformCompany, type PlatformCompany } from '@/api/hooks/platform';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useT } from '@/lib/language';

/**
 * Permanent deletion of a Company that has no Admin: the Company's name must be typed exactly, every Device goes with all its data, the Company's people stay
 * (disabled, with no Company) and can be removed afterwards from the People page. The API refuses while an Admin exists, while a Device lives on another server and while
 * a Device is being worked on - its refusal is shown here, translated.
 */
export function DeleteCompanyDialog({ company, open, onClose, onDeleted }: { company: PlatformCompany; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const t = useT();
  const toast = useAppToast();
  const remove = useDeletePlatformCompany();
  const [typed, setTyped] = useState('');
  const name = company.name ?? '';

  const close = () => {
    setTyped('');
    remove.reset();
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title={t('Delete this company permanently?')}
      intent="destructive"
      confirmLabel={t('Delete company')}
      cancelLabel={t('Cancel')}
      busy={remove.isPending}
      confirmDisabled={typed !== name}
      onCancel={close}
      onConfirm={() =>
        remove.mutate(
          { companyId: company.id ?? 0, confirmName: typed },
          {
            onSuccess: (result) => {
              toast.success(t('The company was deleted ({0} Device(s), {1} person(s) kept)', result.devicesDeleted ?? 0, result.usersKept ?? 0));
              setTyped('');
              onDeleted();
            },
          },
        )
      }
    >
      <Text block style={{ marginBottom: tokens.spacingVerticalS }}>
        {t('Every Device of {0} is deleted with all its data, and the company itself with its servers, places, groups and categories. The people stay, disabled and without a company. This cannot be undone.', name)}
      </Text>
      <Field label={t('Type the company name to confirm')} hint={name}>
        <Input value={typed} onChange={(_, d) => setTyped(d.value)} autoComplete="off" />
      </Field>
      {remove.isError && !remove.isPending && (
        <MessageBar intent="error" style={{ marginTop: tokens.spacingVerticalS }}>
          <MessageBarBody>{t(remove.error.message)}</MessageBarBody>
        </MessageBar>
      )}
    </ConfirmDialog>
  );
}
