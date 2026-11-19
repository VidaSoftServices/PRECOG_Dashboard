import type { IssueEmailFields } from '@/api/domainTypes';
import { formatDateTime } from '@/lib/dateTime';

/**
 * The sentence about an Issue's e-mail notification: when it was sent and, when the API knows it, to how many people. Empty when no
 * e-mail was sent (`notificationSentAt` null). Rendered as is from the API's fields - nothing is inferred in the browser.
 */
export function emailSentText(issue: IssueEmailFields, t: (text: string, ...args: unknown[]) => string): string {
  if (!issue.notificationSentAt) return '';
  const at = formatDateTime(issue.notificationSentAt);
  return issue.emailRecipientCount
    ? t('E-mail sent {0} to {1} recipient(s)', at, issue.emailRecipientCount)
    : t('E-mail sent {0}', at);
}
