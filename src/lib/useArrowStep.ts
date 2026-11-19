import { useEffect, useRef } from 'react';

/**
 * While a large chart window is open, Up / Down move to the previous / next Sensor. Listens on the document (not on the window's own element) so it keeps
 * working after a step, when the focused element has been replaced and the focus fell back to the page; a field or a select that uses the arrow itself is left alone.
 */
export function useArrowStep(open: boolean, onStep: ((delta: -1 | 1) => void) | undefined) {
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });
  const active = open && onStep !== undefined;
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      stepRef.current?.(e.key === 'ArrowDown' ? 1 : -1);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active]);
}
