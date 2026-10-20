import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { LOG_MAX_SKIP, LOG_PAGE_SIZE, auditQuery, systemQuery, type AuditFilters, type SystemFilters } from '@/lib/logFilters';
import type { components } from '@/api/schema.generated';

export type AuditEventDto = components['schemas']['AuditEventDto'];
export type LogEntryDto = components['schemas']['LogEntryDto'];

/**
 * The activity log (who changed what), newest first, 30 entries per page. Company Admin only - the API answers 403 to anyone
 * else, and the page is behind the admin route guard. Pages are fetched with `skip`; "Load more" asks for the next one.
 */
export function useAuditEvents(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.auditLog(filters),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) =>
      unwrap(await apiClient.GET('/api/Logs/Audit', { params: { query: auditQuery(filters, pageParam, LOG_PAGE_SIZE) }, signal })),
    getNextPageParam: (last, pages) => {
      const next = pages.length * LOG_PAGE_SIZE;
      return last.hasMore && next <= LOG_MAX_SKIP ? next : undefined;
    },
  });
}

/**
 * The system (diagnostic) log, newest first, 30 entries per page. Company Admin only. Without a start time the API searches
 * the last 7 days, and a search window may not exceed 31 days (the log is very large) - violations come back as a 400 that
 * the page shows as it is.
 */
export function useSystemLog(filters: SystemFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.systemLog(filters),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) =>
      unwrap(await apiClient.GET('/api/Logs/System', { params: { query: systemQuery(filters, pageParam, LOG_PAGE_SIZE) }, signal })),
    getNextPageParam: (last, pages) => {
      const next = pages.length * LOG_PAGE_SIZE;
      return last.hasMore && next <= LOG_MAX_SKIP ? next : undefined;
    },
  });
}
