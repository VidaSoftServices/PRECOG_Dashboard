import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// globals:false means Testing Library's usual auto-registered cleanup never
// hooks in - do it explicitly so each test starts from an empty document.
afterEach(() => {
  cleanup();
});

// jsdom implements neither observer - Fluent UI components (MessageBar's
// reflow, positioned Combobox/Tooltip/Popover surfaces via
// @fluentui/react-positioning, etc.) use both unconditionally and either
// crash outright (ResizeObserver) or hang indefinitely retrying layout
// measurements that can never resolve (IntersectionObserver-driven
// positioning), which is exactly what made an early Combobox-interaction
// test spin forever instead of failing. A no-op stub is enough - these
// tests only assert on rendered content/attributes, never on real
// layout/pixel measurements.
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
class NoopIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= NoopIntersectionObserver as unknown as typeof IntersectionObserver;

// openapi-fetch's createClient(...) captures `globalThis.fetch` as a default
// parameter the moment src/api/client.ts is first imported - i.e. once per
// test file, well before any individual test body runs. A per-test
// `vi.stubGlobal('fetch', ...)` replaces the global with a brand-new
// function reference that the already-created apiClient never sees, so it
// silently keeps calling whatever `fetch` looked like at import time. This
// installs one stable mock function here in setupFiles (guaranteed to run
// before the test file's own imports), so apiClient permanently holds a
// reference to it; individual tests then just reconfigure its behavior via
// `mockFetchOnce`/`mockFetchJson` from src/test/mockFetch.ts, which mutate
// the same object rather than replacing it.
globalThis.fetch = vi.fn();

afterEach(() => {
  vi.mocked(globalThis.fetch).mockReset();
});
