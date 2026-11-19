import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchMock, mockFetchRoutes } from '@/test/mockFetch';
import { getLanguage, setLanguage } from './language';
import { useSensorDescriptions } from './useSensorDescriptions';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const BOTH = [
  { language: 'en', description: 'about a', updatedAt: '2026-11-19T00:00:00Z' },
  { language: 'hu', description: 'a-ról', updatedAt: '2026-11-19T00:00:00Z' },
];

afterEach(() => {
  setLanguage('en');
  fetchMock().mockReset();
});

describe('useSensorDescriptions', () => {
  it('reads the stored descriptions of the Sensors from the API and shows the text of the chosen language', async () => {
    mockFetchRoutes([
      { match: '/Sensors/10/Descriptions', body: BOTH },
      { match: '/Sensors/11/Descriptions', body: [] },
    ]);
    const { result } = renderHook(
      () => useSensorDescriptions([{ deviceId: 1, sensorId: 10, sensorName: 'a_1', label: 'A' }, { deviceId: 1, sensorId: 11, sensorName: 'b_1' }]),
      { wrapper },
    );
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({ row: { sensorName: 'a_1', description: 'about a' }, label: 'A' });
    // a Sensor without any description is simply absent
    expect(result.current.map((f) => f.row.sensorName)).toEqual(['a_1']);
  });

  it('shows the Hungarian text in Hungarian and falls back to English when there is none', async () => {
    mockFetchRoutes([
      { match: '/Sensors/10/Descriptions', body: BOTH },
      { match: '/Sensors/11/Descriptions', body: [{ language: 'en', description: 'only english', updatedAt: '2026-11-19T00:00:00Z' }] },
    ]);
    setLanguage('hu');
    expect(getLanguage()).toBe('hu');
    const { result } = renderHook(
      () => useSensorDescriptions([{ deviceId: 1, sensorId: 10, sensorName: 'a_1' }, { deviceId: 1, sensorId: 11, sensorName: 'b_1' }]),
      { wrapper },
    );
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((f) => f.row.description)).toEqual(['a-ról', 'only english']);
  });

  it('reads nothing while it is disabled, and shows nothing when the read fails', async () => {
    mockFetchRoutes([{ match: '/Descriptions', status: 500, body: 'boom' }]);
    const disabled = renderHook(() => useSensorDescriptions([{ deviceId: 1, sensorId: 10, sensorName: 'a_1' }], false), { wrapper });
    expect(disabled.result.current).toEqual([]);
    expect(fetchMock()).not.toHaveBeenCalled();

    const failing = renderHook(() => useSensorDescriptions([{ deviceId: 1, sensorId: 10, sensorName: 'a_1' }]), { wrapper });
    await waitFor(() => expect(fetchMock()).toHaveBeenCalled());
    expect(failing.result.current).toEqual([]);
  });
});
