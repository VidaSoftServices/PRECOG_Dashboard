import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Matches the responsive shell breakpoints from the modernization audit (desktop >=1200, tablet 640-1199, mobile <640). */
export function useBreakpoint(): 'desktop' | 'tablet' | 'mobile' {
  const isTablet = useMediaQuery('(max-width: 1199px)');
  const isMobile = useMediaQuery('(max-width: 639px)');
  if (isMobile) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
}
