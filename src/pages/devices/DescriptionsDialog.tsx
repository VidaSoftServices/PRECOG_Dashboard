import { useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  MessageBar,
  MessageBarBody,
  Text,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, ArrowUpload24Regular, Delete24Regular, DocumentArrowUp24Regular, TextDescription24Regular } from '@fluentui/react-icons';
import { useAppToast } from '@/components/ToastProvider';
import { ErrorState } from '@/components/states/ErrorState';
import { useSensors } from '@/api/hooks/sensors';
import { deviceFilePart } from '@/lib/deviceFileName';
import { useDeleteDescriptions, useDeviceDescriptions, useImportDescriptions } from '@/api/hooks/sensorDescriptions';
import { downloadTextFile } from '@/lib/downloadFile';
import { useT } from '@/lib/language';
import { DescriptionFormattingLegend } from './DescriptionFormattingLegend';
import { DESCRIPTION_HEADERS, buildDescriptionSheet, matchToSensors, parseDescriptionSheet } from '@/lib/descriptionSheet';

const useStyles = makeStyles({
  surface: { maxWidth: '860px', width: '96vw' },
  content: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  row: { display: 'flex', gap: tokens.spacingHorizontalM, flexWrap: 'wrap', alignItems: 'center' },
  textarea: { width: '100%', fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  list: { maxHeight: '150px', overflowY: 'auto', margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  muted: { color: tokens.colorNeutralForeground3 },
});

const MAX_LISTED = 12;

/**
 * "Descriptions" (Admin only): the stored indicator descriptions of one Device, in English and Hungarian. A sheet (CSV or pasted cells) with the columns
 * sensorName / language / description is imported - checked first, matched to the Device's Sensors by `sensorName` (the Sensor's external id), and
 * stored by the API (so it is remembered); the stored texts can be exported as the same kind of sheet and removed. One Sensor's texts can also be
 * edited by hand in its Edit dialog. Shown beside the enlarged chart of Live Monitoring and Smart Analytics.
 */
export function DescriptionsDialog({ deviceId, deviceName, open, onClose }: { deviceId: number; deviceName: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const sensorsQuery = useSensors(deviceId);
  const stored = useDeviceDescriptions(deviceId, open);
  const importDescriptions = useImportDescriptions(deviceId);
  const deleteDescriptions = useDeleteDescriptions(deviceId);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [legendOpen, setLegendOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sensorIdByName = useMemo(() => new Map((sensorsQuery.data ?? []).filter((s) => s.externalSensorId).map((s) => [s.externalSensorId!, s.id!])), [sensorsQuery.data]);
  const sensorNames = useMemo(() => [...sensorIdByName.keys()], [sensorIdByName]);
  const parsed = useMemo(() => (text.trim() === '' ? null : parseDescriptionSheet(text)), [text]);
  const match = useMemo(() => (parsed ? matchToSensors(parsed.rows, sensorNames) : null), [parsed, sensorNames]);

  const storedRows = stored.data ?? [];
  const storedEn = storedRows.filter((r) => r.language === 'en').length;
  const storedHu = storedRows.filter((r) => r.language === 'hu').length;
  const busy = importDescriptions.isPending || deleteDescriptions.isPending;
  const canApply = parsed !== null && match !== null && parsed.issues.length === 0 && match.matched.length > 0 && sensorsQuery.data !== undefined && !busy;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  };

  const apply = async () => {
    if (!match) return;
    const items = match.matched.map((r) => ({ sensorId: sensorIdByName.get(r.sensorName)!, language: r.language, description: r.description }));
    const result = await importDescriptions.mutateAsync(items);
    toast.success(
      t('{0} descriptions imported for {1}: {2} new, {3} changed, {4} unchanged.', items.length, deviceName, result.created ?? 0, result.updated ?? 0, result.unchanged ?? 0),
      t('Descriptions imported'),
    );
    onClose();
  };

  const exportSheet = () => {
    const sheet = buildDescriptionSheet(storedRows.map((r) => ({ sensorName: r.externalSensorId, language: r.language, description: r.description })));
    downloadTextFile(`descriptions-${deviceFilePart(deviceId, deviceName)}.csv`, sheet);
  };

  const removeAll = async () => {
    const result = await deleteDescriptions.mutateAsync();
    setConfirmRemove(false);
    toast.success(t('{0} descriptions of {1} were removed.', result.deleted ?? 0, deviceName), t('Descriptions removed'));
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()} modalType="alert">
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>{t('Descriptions')} - {deviceName}</DialogTitle>
          <DialogContent className={styles.content}>
            <Text>
              {t('Three columns:')}{' '}<b>SensorName</b> {t("(the Sensor's external id, which identifies it exactly),")}{' '}<b>Language</b> (<b>EN</b> {t('or')}{' '}<b>HU</b> {t('- one row per Sensor and language; the language chosen in the top bar decides which one is shown) and')}{' '}<b>Description</b>{t(', the whole text shown at that indicator in the large chart window of Live Monitoring and Smart Analytics. Decorate the text with the Azure DevOps markdown basics (')}<code>## heading</code>, <code>**bold**</code>, <code>- list</code>{t(', ...) - open the formatting legend to see them all. Start with what the group of indicators (for example RMS) is for, then what this indicator shows.')}
            </Text>

            <MessageBar intent={storedRows.length > 0 ? 'info' : 'warning'}>
              <MessageBarBody>
                {stored.isLoading
                  ? t('Loading…')
                  : storedRows.length > 0
                    ? t('{0} descriptions are stored for this Device (English {1}, Hungarian {2}). Importing replaces the texts of the Sensors in the sheet; the others stay. A single Sensor can also be edited by hand in its Edit dialog.', storedRows.length, storedEn, storedHu)
                    : t('No description is stored for this Device yet. Import a sheet, or write one Sensor at a time in its Edit dialog.')}
              </MessageBarBody>
            </MessageBar>
            {stored.isError && <ErrorState error={stored.error} />}

            <div className={styles.row}>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => void readFile(e.target.files?.[0])} />
              <Button icon={<DocumentArrowUp24Regular />} onClick={() => fileRef.current?.click()}>
                {t('Choose a .csv file')}
              </Button>
              {fileName && <Text className={styles.muted}>{fileName}</Text>}
              <Button icon={<ArrowUpload24Regular />} disabled={storedRows.length === 0} onClick={exportSheet}>
                {t('Export descriptions')}
              </Button>
            </div>

            <Text className={styles.muted}>{t('Download a template (one measuring point, 162 indicators, English and Hungarian):')}</Text>
            <div className={styles.row}>
              <Button as="a" href="/templates/description-template-pump-162.csv" download icon={<ArrowDownload24Regular />}>
                {t('Template: pump')}
              </Button>
              <Button as="a" href="/templates/description-template-fan-162.csv" download icon={<ArrowDownload24Regular />}>
                {t('Template: fan')}
              </Button>
              <Button appearance="subtle" icon={<TextDescription24Regular />} aria-expanded={legendOpen} onClick={() => setLegendOpen(!legendOpen)}>
                {legendOpen ? t('Hide the formatting legend') : t('Formatting legend')}
              </Button>
            </div>
            <Text size={200} className={styles.muted}>
              {t('The templates name the Sensors')}{' '}<code>metric_name_1</code> {t('... (measuring point 1); replace the')}{' '}<code>_1</code> {t('ending with')}{' '}<code>_2</code> {t("for a second point, or rename the rows to your Device's Sensor names.")}
            </Text>
            {legendOpen && <DescriptionFormattingLegend />}

            <Field label={t('…or paste the cells (Excel) here')}>
              <Textarea
                className={styles.textarea}
                rows={5}
                resize="vertical"
                value={text.length > 20000 ? `${text.slice(0, 20000)}…` : text}
                readOnly={text.length > 20000}
                onChange={(_, d) => {
                  setText(d.value);
                  setFileName('');
                }}
                placeholder={DESCRIPTION_HEADERS.join(',')}
              />
            </Field>

            {parsed && match && (
              <>
                {parsed.issues.length > 0 ? (
                  <MessageBar intent="error">
                    <MessageBarBody>
                      {parsed.issues.length} {t('problem(s) - nothing is imported until they are fixed:')}
                      <ul className={styles.list}>
                        {parsed.issues.slice(0, MAX_LISTED).map((i) => (
                          <li key={`${i.line}-${i.message}`}>
                            {t('line')} {i.line}: {i.message}
                          </li>
                        ))}
                        {parsed.issues.length > MAX_LISTED && <li>{t('… and')} {parsed.issues.length - MAX_LISTED} {t('more')}</li>}
                      </ul>
                    </MessageBarBody>
                  </MessageBar>
                ) : (
                  <MessageBar intent={match.matched.length > 0 ? 'success' : 'warning'}>
                    <MessageBarBody>
                      {match.matched.length} {t('of')} {parsed.rows.length} {t('rows match a Sensor of this Device.')}
                      {match.withoutDescription.length > 0 && t(' {0} Sensor(s) of the Device have no description.', match.withoutDescription.length)}
                    </MessageBarBody>
                  </MessageBar>
                )}
                {match.unknown.length > 0 && (
                  <MessageBar intent="warning">
                    <MessageBarBody>
                      {match.unknown.length} {t('row(s) name a Sensor this Device does not have and are ignored (for example')} {match.unknown.slice(0, 3).join(', ')}{t('). Is this the sheet of another Device?')}
                    </MessageBarBody>
                  </MessageBar>
                )}
                {parsed.ignoredColumns.length > 0 && <Text className={styles.muted}>{t('Ignored column(s):')} {parsed.ignoredColumns.join(', ')}</Text>}
              </>
            )}
            {importDescriptions.isError && <ErrorState error={importDescriptions.error} />}

            {storedRows.length > 0 && (
              <div className={styles.row}>
                <Checkbox
                  checked={confirmRemove}
                  onChange={(_, d) => setConfirmRemove(d.checked === true)}
                  label={t('I understand that all {0} stored descriptions of this Device are removed for good (export them first if they are needed again).', storedRows.length)}
                />
                <Button appearance="outline" icon={<Delete24Regular />} disabled={!confirmRemove || busy} onClick={() => void removeAll()}>
                  {t('Remove all descriptions')}
                </Button>
              </div>
            )}
            {deleteDescriptions.isError && <ErrorState error={deleteDescriptions.error} />}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              {t('Close')}
            </Button>
            <Button appearance="primary" disabled={!canApply} onClick={() => void apply()}>
              {importDescriptions.isPending ? t('Importing…') : t('Import {0} descriptions', match && match.matched.length > 0 ? match.matched.length : '')}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
