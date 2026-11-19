import { describe, expect, it } from 'vitest';
import { emailSentText } from './issueEmail';
import { formatDateTime } from './dateTime';
import { translate } from './language';

const en = (text: string, ...args: unknown[]) => translate(text, 'en', args);
const hu = (text: string, ...args: unknown[]) => translate(text, 'hu', args);

describe('emailSentText', () => {
  const at = '2026-11-19T10:06:00Z';

  it('says when and to how many people the Issue e-mail went', () => {
    expect(emailSentText({ notificationSentAt: at, emailRecipientCount: 3 }, en)).toBe(`E-mail sent ${formatDateTime(at)} to 3 recipient(s)`);
    expect(emailSentText({ notificationSentAt: at, emailRecipientCount: 3 }, hu)).toBe(`E-mail elküldve: ${formatDateTime(at)}, 3 címzettnek`);
  });

  it('leaves the count out when the API does not know it', () => {
    expect(emailSentText({ notificationSentAt: at, emailRecipientCount: null }, en)).toBe(`E-mail sent ${formatDateTime(at)}`);
  });

  it('is empty when no e-mail was sent', () => {
    expect(emailSentText({ notificationSentAt: null, emailRecipientCount: null }, en)).toBe('');
    expect(emailSentText({}, en)).toBe('');
  });
});
