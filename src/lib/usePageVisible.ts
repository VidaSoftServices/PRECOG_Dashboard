import { useSyncExternalStore } from 'react';

/** Backs the "pause polling when the page is hidden" requirement (decision #9) - explicit, not assumed from React Query defaults. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener('visibilitychange', onChange);
      return () => document.removeEventListener('visibilitychange', onChange);
    },
    () => document.visibilityState === 'visible',
    () => true,
  );
}
