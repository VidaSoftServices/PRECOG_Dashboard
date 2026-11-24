/**
 * A tab opened before a deploy still runs the old build: the first time it opens a page it has not loaded yet, the old page file no longer exists on the server
 * (`serve -s` answers with index.html), the dynamic import fails, and React Router showed "Unexpected Application Error! Failed to fetch dynamically imported
 * module". Vite announces exactly this failure with the `vite:preloadError` event; the page is then loaded again (the new build, at the same URL). The token lives
 * only in memory, so the person signs in again and the login page returns them to the page they wanted.
 *
 * A reload is tried at most once in RELOAD_GUARD_MS (the time of the last try is kept in sessionStorage - a UI convenience, nothing auth-related), so a file that is
 * really missing shows its error instead of reloading for ever.
 */
export const RELOAD_GUARD_MS = 30_000;
const KEY = 'precog.staleBuildReloadAt';

function lastTry(storage: Storage | undefined): number {
  try {
    return Number(storage?.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

function remember(storage: Storage | undefined, at: number): void {
  try {
    storage?.setItem(KEY, String(at));
  } catch {
    // no storage (private mode): the reload still happens, only the guard is lost
  }
}

export function installStaleBuildReload(
  target: Pick<Window, 'addEventListener'> = window,
  reload: () => void = () => window.location.reload(),
  storage: Storage | undefined = typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
  now: () => number = Date.now,
): void {
  target.addEventListener('vite:preloadError', (event: Event) => {
    if (now() - lastTry(storage) < RELOAD_GUARD_MS) return; // tried just now: let the error show
    remember(storage, now());
    event.preventDefault();
    reload();
  });
}
