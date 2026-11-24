import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { makeStyles } from '@fluentui/react-components';
import { apiClient } from '@/api/client';
import type { PlatformCompany } from '@/api/hooks/platform';

const useStyles = makeStyles({
  list: { height: '24px', maxWidth: '72px', objectFit: 'contain', verticalAlign: 'middle' },
  detail: { height: '48px', maxWidth: '200px', objectFit: 'contain' },
});

/**
 * The uploaded logo of a Company (platform administrator), fetched with the HMAC header (an image tag cannot send it) and shown from an object URL that is
 * released again. The picture is cached per Company and upload (`logoUpdatedAt`), so the list row and the opened Company share one request, and nothing is
 * requested for a Company without an uploaded logo. `size` is the small picture of the Companies list or the larger one of the opened Company.
 */
export function PlatformCompanyLogo({ company, size }: { company: PlatformCompany; size: 'list' | 'detail' }) {
  const styles = useStyles();
  const companyId = company.id ?? 0;
  const has = company.hasUploadedLogo === true;
  const version = company.logoUpdatedAt ?? '';

  const logo = useQuery({
    queryKey: ['platform', 'companies', companyId, 'logo', version],
    enabled: has && companyId > 0,
    staleTime: Infinity,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await apiClient.GET('/api/Platform/Companies/{companyId}/Logo', { params: { path: { companyId } }, parseAs: 'blob', signal });
      return (result.data as Blob | undefined) ?? null; // parseAs blob: a Blob on success, nothing on an error status
    },
  });

  const [url, setUrl] = useState<string | null>(null);
  const blob = has ? (logo.data ?? null) : null;
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) return null;
  return <img src={url} alt="" className={size === 'list' ? styles.list : styles.detail} onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
}
