import { Building24Regular } from '@fluentui/react-icons';
import { EmptyState } from './EmptyState';
import { useT } from '@/lib/language';

/** The person's Company was disabled by the platform administrator: its people cannot work and its Devices are not accepted until it is enabled again. */
export function CompanyDisabledState() {
  const t = useT();
  return (
    <EmptyState
      icon={<Building24Regular />}
      title={t('Your company is disabled')}
      description={t('Your company has been disabled, so nothing can be shown or changed until it is enabled again. Contact the platform administrator.')}
    />
  );
}
