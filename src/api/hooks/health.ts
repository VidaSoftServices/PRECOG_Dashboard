import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';

const baseUrl = import.meta.env.VITE_API_BASE_URL as string;

/**
 * Neither /health endpoint requires authentication or carries the HMAC_Key
 * header the rest of the app uses, and neither is a documented Swagger
 * operation - both are plain ASP.NET Core health-check endpoints. Called
 * directly with fetch rather than through apiClient/openapi-fetch, which is
 * typed only against the 104 documented operations.
 */
async function fetchHealth(path: '/health/live' | '/health', signal: AbortSignal): Promise<'Healthy' | 'Unhealthy'> {
  const response = await fetch(`${baseUrl}${path}`, { signal });
  const text = (await response.text()).trim();
  return text === 'Healthy' ? 'Healthy' : 'Unhealthy';
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: async ({ signal }) => {
      const [live, ready] = await Promise.all([fetchHealth('/health/live', signal), fetchHealth('/health', signal)]);
      return { live, ready };
    },
    refetchInterval: 30_000,
    retry: false,
  });
}
