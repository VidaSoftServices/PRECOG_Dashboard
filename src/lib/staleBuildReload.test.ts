import { describe, it, expect, vi } from 'vitest';
import { installStaleBuildReload, RELOAD_GUARD_MS } from './staleBuildReload';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

describe('installStaleBuildReload', () => {
  it('reloads the page once when a page file of an older build cannot be loaded, and not again right after', () => {
    const target = new EventTarget();
    const reload = vi.fn();
    let time = 1_000_000;
    installStaleBuildReload(target as unknown as Window, reload, memoryStorage(), () => time);

    const first = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(first);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true); // the error is not thrown: the page is replaced

    time += 5_000;
    const again = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(again);
    expect(reload).toHaveBeenCalledTimes(1); // a file that is really missing shows its error, no reload loop
    expect(again.defaultPrevented).toBe(false);

    time += RELOAD_GUARD_MS;
    target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(2); // a later deploy is handled again
  });
});
