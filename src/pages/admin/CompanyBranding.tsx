import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Link, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowUpload16Regular, Delete16Regular, Edit16Regular } from '@fluentui/react-icons';
import { apiClient } from '@/api/client';
import { useDeleteCompanyLogo, useUpdateCompanyWebsite, useUploadCompanyLogo, type CompanyDto } from '@/api/hooks/company';
import { useAppToast } from '@/components/ToastProvider';
import { useT } from '@/lib/language';
import { isSafeHttpsUrl } from '@/lib/safeExternalUrl';

const MAX_LOGO_BYTES = 512 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const useStyles = makeStyles({
  logo: { height: '48px', maxWidth: '200px', objectFit: 'contain' },
  block: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  row: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'flex-end' },
  grow: { flex: '1 1 260px' },
  hidden: { display: 'none' },
});

/**
 * The picture of a Company: the uploaded logo when there is one (fetched with the HMAC header - an image tag cannot send it - and shown from an object URL that is
 * released again), otherwise the older URL-style logo when it is a safe https address. Hidden silently when it fails to load.
 */
export function CompanyLogoView({ company }: { company: CompanyDto }) {
  const styles = useStyles();
  const [url, setUrl] = useState<string | null>(null);
  const has = company.hasUploadedLogo === true;
  const version = company.logoUpdatedAt ?? '';

  useEffect(() => {
    if (!has) {
      setUrl(null);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    apiClient
      .GET('/api/Company/Logo', { parseAs: 'blob', signal: controller.signal })
      .then((result) => {
        if (result.data instanceof Blob) {
          objectUrl = URL.createObjectURL(result.data);
          setUrl(objectUrl);
        }
      })
      .catch(() => setUrl(null));
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [has, version]);

  const src = url ?? (!has && isSafeHttpsUrl(company.logo) ? company.logo : null);
  if (!src) return null;
  // The image is untrusted content shown as an image only; a failed load is hidden rather than showing a broken-image icon.
  return <img src={src} alt="" className={styles.logo} onError={(e) => { e.currentTarget.style.display = 'none'; }} />;
}

/** Edit the website and upload / remove the logo of the Company (a Company Admin; the API refuses anyone else). */
export function CompanyBranding({ company }: { company: CompanyDto }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const updateWebsite = useUpdateCompanyWebsite();
  const uploadLogo = useUploadCompanyLogo();
  const deleteLogo = useDeleteCompanyLogo();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteDraft, setWebsiteDraft] = useState('');
  const [fileProblem, setFileProblem] = useState<string | null>(null);

  const saveWebsite = async () => {
    await updateWebsite.mutateAsync(websiteDraft.trim());
    toast.success(t('Company website updated'));
    setEditingWebsite(false);
  };

  const chooseFile = async (file: File | undefined) => {
    setFileProblem(null);
    if (!file) return;
    // The API checks the content again; this only saves a round trip and tells the person at once.
    if (!LOGO_TYPES.includes(file.type) || file.size > MAX_LOGO_BYTES || file.size === 0) {
      setFileProblem('Choose a PNG, JPEG or WebP image of at most 512 KB.');
      return;
    }
    await uploadLogo.mutateAsync(file);
    toast.success(t('Company logo updated'));
  };

  const error = fileProblem ?? uploadLogo.error?.message ?? deleteLogo.error?.message ?? updateWebsite.error?.message ?? null;

  return (
    <div className={styles.block}>
      <div className={styles.row}>
        <Text weight="semibold">{t('Logo')}</Text>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className={styles.hidden}
          aria-label={t('Logo file')}
          onChange={(e) => {
            void chooseFile(e.target.files?.[0]).catch(() => undefined);
            e.target.value = '';
          }}
        />
        <Button size="small" icon={<ArrowUpload16Regular />} onClick={() => fileInput.current?.click()} disabled={uploadLogo.isPending}>
          {company.hasUploadedLogo ? t('Replace logo') : t('Upload logo')}
        </Button>
        {company.hasUploadedLogo && (
          <Button
            size="small"
            appearance="subtle"
            icon={<Delete16Regular />}
            disabled={deleteLogo.isPending}
            onClick={() => deleteLogo.mutate(undefined, { onSuccess: () => toast.success(t('Company logo removed')) })}
          >
            {t('Remove logo')}
          </Button>
        )}
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {t('PNG, JPEG or WebP, at most 512 KB.')}
        </Text>
      </div>

      {editingWebsite ? (
        <div className={styles.row}>
          <Field label={t('Website')} className={styles.grow}>
            <Input value={websiteDraft} onChange={(_, d) => setWebsiteDraft(d.value)} placeholder="https://" maxLength={512} />
          </Field>
          <Button appearance="primary" disabled={updateWebsite.isPending} onClick={() => void saveWebsite().catch(() => undefined)}>
            {updateWebsite.isPending ? t('Saving…') : t('Save')}
          </Button>
          <Button appearance="secondary" disabled={updateWebsite.isPending} onClick={() => setEditingWebsite(false)}>
            {t('Cancel')}
          </Button>
        </div>
      ) : (
        <div className={styles.row}>
          <Text weight="semibold">{t('Website')}</Text>
          {company.website ? (
            isSafeHttpsUrl(company.website) ? (
              <Link href={company.website} target="_blank" rel="noopener noreferrer">
                {company.website}
              </Link>
            ) : (
              <Text size={200}>{company.website}</Text>
            )
          ) : (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              {t('No website')}
            </Text>
          )}
          <Button
            size="small"
            icon={<Edit16Regular />}
            onClick={() => {
              setWebsiteDraft(company.website ?? '');
              setEditingWebsite(true);
            }}
          >
            {t('Edit website')}
          </Button>
        </div>
      )}

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{t(error)}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}
