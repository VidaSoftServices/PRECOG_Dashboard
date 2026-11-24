/**
 * The rules of a NEW password, mirroring the API (`PasswordPolicy`): 10-128 characters, not blank, at least four different characters, not the e-mail
 * address. The API checks them again and is the authority; this only saves a round trip and tells the person at once. Returns the English text of the
 * first problem (shown through t(): every text here has its Hungarian version), or null when the password is acceptable.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export function checkNewPassword(password: string, repeated: string, email?: string | null): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'The password must be at least 10 characters long.';
  if (password.length > MAX_PASSWORD_LENGTH) return 'The password must be at most 128 characters long.';
  if (password.trim().length === 0) return 'The password must not be blank.';
  if (new Set(password).size < 4) return 'The password is too simple: use at least four different characters.';
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) return 'The password must not be your e-mail address or login name.';
  if (password !== repeated) return 'The passwords do not match.';
  return null;
}
