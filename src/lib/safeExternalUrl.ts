/**
 * Company.Logo/Website (and CurrentUserDto's mirrors of them) are untrusted
 * external text returned verbatim by the API - never fetched, proxied, or
 * validated server-side (see CLAUDE.md's Company-profile section). Consumers
 * must allow only safe schemes and never render them as raw HTML. This is
 * the one shared check for "is this worth handing to <img src>/<a href> at
 * all" - an https URL, nothing else (no data:/javascript:/relative paths,
 * which the API's own docs don't promise and which <img>/<a> would otherwise
 * happily attempt).
 */
export function isSafeHttpsUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
