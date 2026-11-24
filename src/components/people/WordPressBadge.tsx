import { Badge, Tooltip } from '@fluentui/react-components';
import { Globe16Regular } from '@fluentui/react-icons';
import { useT } from '@/lib/language';

/**
 * Marks a User that came from the old WordPress user list (the history of the account only: since the WordPress synchronization was removed the person is managed
 * here like everyone else - roles, password, removal). An icon AND a text, never colour alone.
 */
export function WordPressBadge() {
  const t = useT();
  return (
    <Tooltip content={t('Imported from the old WordPress user list. The person is managed here now, like everyone else.')} relationship="description">
      <Badge appearance="outline" color="informative" icon={<Globe16Regular />}>
        {t('WordPress')}
      </Badge>
    </Tooltip>
  );
}
