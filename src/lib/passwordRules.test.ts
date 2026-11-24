import { describe, expect, it } from 'vitest';
import { checkNewPassword } from './passwordRules';

describe('checkNewPassword', () => {
  it('accepts a good password that was repeated', () => {
    expect(checkNewPassword('a-fine-password-1', 'a-fine-password-1', 'someone@example.test')).toBeNull();
  });

  it.each([
    ['short', 'short', 'The password must be at least 10 characters long.'],
    ['x'.repeat(129), 'x'.repeat(129), 'The password must be at most 128 characters long.'],
    ['          ', '          ', 'The password must not be blank.'],
    ['aaaaaaaaaaaa', 'aaaaaaaaaaaa', 'The password is too simple: use at least four different characters.'],
    ['a-fine-password-1', 'a-fine-password-2', 'The passwords do not match.'],
  ])('refuses %j', (password, repeated, reason) => {
    expect(checkNewPassword(password, repeated, 'someone@example.test')).toBe(reason);
  });

  it('refuses the e-mail address as the password, in any case', () => {
    expect(checkNewPassword('Someone@Example.Test', 'Someone@Example.Test', 'someone@example.test')).toBe(
      'The password must not be your e-mail address or login name.',
    );
  });
});
