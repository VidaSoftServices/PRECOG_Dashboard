import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Typed, minimal wrapper around a single numeric search param - the
 * replacement for the old dashboard's `?deviceId&issueId` hand-parsed hack
 * (decision #15). Shareable view state only - never a token/secret (decision
 * #12).
 */
export function useNumberSearchParam(key: string): [number | undefined, (value: number | undefined) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key);
  const value = raw !== null && !Number.isNaN(Number(raw)) ? Number(raw) : undefined;

  const setValue = useCallback(
    (next: number | undefined) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === undefined) params.delete(key);
          else params.set(key, String(next));
          return params;
        },
        { replace: true },
      );
    },
    [key, setSearchParams],
  );

  return [value, setValue];
}
