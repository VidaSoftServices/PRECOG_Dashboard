import { describe, expect, it } from 'vitest';
import { localizedIssueMessage } from './issueMessage';

describe('localizedIssueMessage', () => {
  const both = { message: 'Nő a rezgés', messageHu: 'Nő a rezgés', messageEn: 'Vibration is rising' };

  it('shows the text of the chosen language, whichever language the message was written in', () => {
    expect(localizedIssueMessage(both, 'hu')).toBe('Nő a rezgés');
    expect(localizedIssueMessage(both, 'en')).toBe('Vibration is rising');
    expect(localizedIssueMessage({ message: 'Vibration is rising', messageHu: 'Nő a rezgés', messageEn: 'Vibration is rising' }, 'hu')).toBe('Nő a rezgés');
  });

  it('falls back to the source text until the translation exists', () => {
    expect(localizedIssueMessage({ message: 'Vibration is rising', messageHu: null, messageEn: null }, 'hu')).toBe('Vibration is rising');
    expect(localizedIssueMessage({ message: 'Nő a rezgés' }, 'en')).toBe('Nő a rezgés');
  });

  it('shows nothing when there is no message', () => {
    expect(localizedIssueMessage({ message: '', messageHu: null, messageEn: null }, 'hu')).toBeNull();
    expect(localizedIssueMessage(undefined, 'en')).toBeNull();
  });
});
