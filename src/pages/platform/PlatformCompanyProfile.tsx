import { useRef, useState } from 'react';
import { Button, Field, Input, Link, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ArrowUpload16Regular, Delete16Regular, Edit16Regular } from '@fluentui/react-icons';
import {
  useChangePlatformCompanyWebsite,
  useDeletePlatformCompanyLogo,
  useRenamePlatformCompany,
  useUploadPlatformCompanyLogo,
  type PlatformCompany,
} from '@/api/hooks/platform';
import { PlatformCompanyLogo } from './PlatformCompanyLogo';
import { useAppToast } from '@/components/ToastProvider';
import { useT } from '@/lib/language';
import { isSafeHttpsUrl } from '@/lib/safeExternalUrl';

const MAX_LOGO_BYTES = 512 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const useStyles = makeStyles({
  block: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  row: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'flex-end' },
  grow: { flex: '1 1 260px' },
  hidden: { display: 'none' },
});

/** Name, website and logo of a Company, edited by the platform administrator (VSSSysAdmin). */
export function PlatformCompanyProfile({ company }: { company: PlatformCompany }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const companyId = company.id ?? 0;
  const rename = useRenamePlatformCompany();
  const changeWebsite = useChangePlatformCompanyWebsite();
  const upload = useUploadPlatformCompanyLogo();
  const removeLogo = useDeletePlatformCompanyLogo();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<'name' | 'website' | null>(null);
  const [draft, setDraft] = useState('');
  const [fileProblem, setFileProblem] = useState<string | null>(null);

  const save = async () => {
    if (editing === 'name') {
      await rename.mutateAsync({ companyId, name: draft.trim() });
      toast.success(t('Company name updated'));
    } else {
      await changeWebsite.mutateAsync({ companyId, website: draft.trim() });
      toast.success(t('Company website updated'));
    }
    setEditing(null);
  };

  const chooseFile = async (file: File | undefined) => {
    setFileProblem(null);
    if (!file) return;
    // The API checks the content again; this only saves a round trip and tells the person at once.
    if (!LOGO_TYPES.includes(file.type) || file.size > MAX_LOGO_BYTES || file.size === 0) {
      setFileProblem('Choose a PNG, JPEG or WebP image of at most 512 KB.');
      return;
    }
    await upload.mutateAsync({ companyId, file });
    toast.success(t('Company logo updated'));
  };

  const saving = rename.isPending || changeWebsite.isPending;
  const error = fileProblem ?? upload.error?.message ?? removeLogo.error?.message ?? rename.error?.message ?? changeWebsite.error?.message ?? null;

  return (
    <div className={styles.block}>
      <div className={styles.row}>
        <PlatformCompanyLogo company={company} size="detail" />
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
        <Button size="small" icon={<ArrowUpload16Regular />} onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
          {company.hasUploadedLogo ? t('Replace logo') : t('Upload logo')}
        </Button>
        {company.hasUploadedLogo && (
          <Button
            size="small"
            appearance="subtle"
            icon={<Delete16Regular />}
            disabled={removeLogo.isPending}
            onClick={() => removeLogo.mutate(companyId, { onSuccess: () => toast.success(t('Company logo removed')) })}
          >
            {t('Remove logo')}
          </Button>
        )}
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {t('PNG, JPEG or WebP, at most 512 KB.')}
        </Text>
      </div>

      {editing ? (
        <div className={styles.row}>
          <Field label={editing === 'name' ? t('Company name') : t('Website')} className={styles.grow}>
            <Input value={draft} onChange={(_, d) => setDraft(d.value)} placeholder={editing === 'website' ? 'https://' : undefined} maxLength={editing === 'name' ? 200 : 512} />
          </Field>
          <Button appearance="primary" disabled={saving} onClick={() => void save().catch(() => undefined)}>
            {saving ? t('Saving…') : t('Save')}
          </Button>
          <Button appearance="secondary" disabled={saving} onClick={() => setEditing(null)}>
            {t('Cancel')}
          </Button>
        </div>
      ) : (
        <>
          <div className={styles.row}>
            <Text weight="semibold">{t('Company name')}</Text>
            <Text>{company.name}</Text>
            <Button size="small" icon={<Edit16Regular />} onClick={() => { setDraft(company.name ?? ''); setEditing('name'); }}>
              {t('Rename company')}
            </Button>
          </div>
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
            <Button size="small" icon={<Edit16Regular />} onClick={() => { setDraft(company.website ?? ''); setEditing('website'); }}>
              {t('Edit website')}
            </Button>
          </div>
        </>
      )}

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{t(error)}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}
