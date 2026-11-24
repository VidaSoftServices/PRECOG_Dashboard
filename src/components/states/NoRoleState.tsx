import { PersonProhibited24Regular } from '@fluentui/react-icons';
import { EmptyState } from './EmptyState';
import { useT } from '@/lib/language';

/**
 * A person who belongs to a Company but holds neither the Admin nor the Reader role: the sign-in is valid and the account is real, but the API shows such a person
 * nothing of the Company (every Company endpoint answers 403). AppShell renders this instead of any page, so no page fires a query that would only fail.
 */
export function NoRoleState() {
  const t = useT();
  return (
    <EmptyState
      icon={<PersonProhibited24Regular />}
      title={t('You have no access yet')}
      description={t('Your sign-in is valid, but you have not been given a role in your company yet. Ask your company administrator to make you a Reader or an Administrator.')}
    />
  );
}
