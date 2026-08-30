import type { ReactElement } from 'react';
import { Badge, type BadgeProps } from '@fluentui/react-components';
import {
  CheckmarkCircle16Regular,
  Warning16Regular,
  ErrorCircle16Regular,
  QuestionCircle16Regular,
  Circle16Regular,
} from '@fluentui/react-icons';
import type { Freshness } from '@/lib/dateTime';

/**
 * Status is never conveyed by color alone (audit accessibility finding) -
 * every pill pairs a color with a distinct icon shape and a text label.
 */

const freshnessConfig: Record<Freshness, { intent: BadgeProps['color']; icon: ReactElement; label: string }> = {
  fresh: { intent: 'success', icon: <CheckmarkCircle16Regular />, label: 'Fresh' },
  aging: { intent: 'warning', icon: <Warning16Regular />, label: 'Aging' },
  stale: { intent: 'danger', icon: <ErrorCircle16Regular />, label: 'Stale' },
  unknown: { intent: 'subtle', icon: <QuestionCircle16Regular />, label: 'No data' },
};

export function FreshnessPill({ freshness }: { freshness: Freshness }) {
  const config = freshnessConfig[freshness];
  return (
    <Badge appearance="tint" color={config.intent} icon={config.icon}>
      {config.label}
    </Badge>
  );
}

const reviewStateConfig: Record<string, { intent: BadgeProps['color']; label: string }> = {
  PendingReview: { intent: 'warning', label: 'Pending review' },
  ReviewedFault: { intent: 'danger', label: 'Fault' },
  ReviewedFalsePositive: { intent: 'success', label: 'False positive' },
};

export function ReviewStatePill({ reviewState }: { reviewState: string | null | undefined }) {
  const config = reviewState ? reviewStateConfig[reviewState] : undefined;
  return (
    <Badge appearance="tint" color={config?.intent ?? 'subtle'}>
      {config?.label ?? reviewState ?? 'Unknown'}
    </Badge>
  );
}

const jobStatusConfig: Record<string, { intent: BadgeProps['color']; icon: ReactElement }> = {
  Pending: { intent: 'subtle', icon: <Circle16Regular /> },
  Queued: { intent: 'subtle', icon: <Circle16Regular /> },
  Claimed: { intent: 'informative', icon: <Circle16Regular /> },
  Processing: { intent: 'informative', icon: <Circle16Regular /> },
  Completed: { intent: 'success', icon: <CheckmarkCircle16Regular /> },
  Succeeded: { intent: 'success', icon: <CheckmarkCircle16Regular /> },
  Failed: { intent: 'danger', icon: <ErrorCircle16Regular /> },
  Cancelled: { intent: 'subtle', icon: <ErrorCircle16Regular /> },
};

export function JobStatusPill({ status }: { status: string | null | undefined }) {
  const config = status ? jobStatusConfig[status] : undefined;
  return (
    <Badge appearance="tint" color={config?.intent ?? 'subtle'} icon={config?.icon}>
      {status ?? 'Unknown'}
    </Badge>
  );
}

export function EnabledPill({ enabled }: { enabled: boolean | null | undefined }) {
  return enabled ? (
    <Badge appearance="tint" color="success" icon={<CheckmarkCircle16Regular />}>
      Enabled
    </Badge>
  ) : (
    <Badge appearance="tint" color="subtle" icon={<Circle16Regular />}>
      Disabled
    </Badge>
  );
}
