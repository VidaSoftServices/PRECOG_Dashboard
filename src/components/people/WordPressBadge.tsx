import { Badge, Tooltip } from '@fluentui/react-components';
import { Globe16Regular } from '@fluentui/react-icons';
import { useT } from '@/lib/language';

/**
 * Marks a User that comes from WordPress (synchronized): where the person manages the password, and - while the synchronization is on - a User that cannot be
 * removed here. An icon AND a text, never colour alone.
 */
export function WordPressBadge() {
  const t = useT();
  return (
    <Tooltip content={t('Synchronized from WordPress: the password is managed there.')} relationship="description">
      <Badge appearance="outline" color="informative" icon={<Globe16Regular />}>
        {t('WordPress')}
      </Badge>
    </Tooltip>
  );
}
