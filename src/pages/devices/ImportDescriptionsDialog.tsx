import { useMemo, useRef, useState } from 'react';
import {
  Button,
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
import { ArrowDownload24Regular, DocumentArrowUp24Regular, TextDescription24Regular } from '@fluentui/react-icons';
import { useAppToast } from '@/components/ToastProvider';
import { useSensors } from '@/api/hooks/sensors';
import { clearDeviceDescriptions, setDeviceDescriptions, useDeviceDescriptions } from '@/lib/descriptionStore';
import { DescriptionFormattingLegend } from './DescriptionFormattingLegend';
import { DESCRIPTION_COLUMNS, matchToSensors, parseDescriptionSheet } from '@/lib/descriptionSheet';
import { useT } from '@/lib/language';

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
 * "Import descriptions" (Admin only): one sheet per Device that gives every indicator (Sensor) one markdown description, shown beside the
 * enlarged chart of Live Monitoring and Smart Analytics. Rows are matched to the Device's Sensors by `sensorName` (the Sensor's
 * external id); the sheet is checked before anything is kept.
 * PROTOTYPE: the texts are kept in this browser tab only (see descriptionStore.ts).
 */
export function ImportDescriptionsDialog({ deviceId, deviceName, open, onClose }: { deviceId: number; deviceName: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const sensorsQuery = useSensors(deviceId);
  const existing = useDeviceDescriptions(deviceId);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [legendOpen, setLegendOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sensorNames = useMemo(() => (sensorsQuery.data ?? []).map((s) => s.externalSensorId ?? '').filter(Boolean), [sensorsQuery.data]);
  const parsed = useMemo(() => (text.trim() === '' ? null : parseDescriptionSheet(text)), [text]);
  const match = useMemo(() => (parsed ? matchToSensors(parsed.rows, sensorNames) : null), [parsed, sensorNames]);

  const canApply = parsed !== null && match !== null && parsed.issues.length === 0 && match.matched.length > 0 && sensorsQuery.data !== undefined;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  };

  const apply = () => {
    if (!match) return;
    setDeviceDescriptions(deviceId, { rows: match.matched, fileName: fileName || 'pasted sheet', importedAt: Date.now() });
    toast.success(t('{0} indicator descriptions imported for {1}.', match.matched.length, deviceName), t('Descriptions imported'));
    onClose();
  };

  const remove = () => {
    clearDeviceDescriptions(deviceId);
    toast.success(t('The descriptions of {0} were removed.', deviceName), t('Descriptions removed'));
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()} modalType="alert">
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>{t('Import descriptions -')}{' '}{deviceName}</DialogTitle>
          <DialogContent className={styles.content}>
            <Text>
              {t('Three columns:')}{' '}<b>{t('sensorName')}</b> {t('(the Sensor\'s external id, which identifies it exactly),')}{' '}<b>{t('language')}</b> (<b>{t('EN')}</b> {t('or')}{' '}<b>{t('HU')}</b> {t('- one row per Sensor and language; the language chosen in the top bar decides which one is shown) and')}{' '}<b>{t('description')}</b>{t(', the whole text shown at that indicator in the large chart window of Live Monitoring and Smart Analytics. Decorate the text with the Azure DevOps markdown basics (')}<code>{t('## heading')}</code>, <code>{t('**bold**')}</code>, <code>{t('- list')}</code>{t(', ...) - open the formatting legend to see them all. Start with what the group of indicators (for example RMS) is for, then what this indicator shows.')}</Text>

            {existing && (
              <MessageBar intent="info">
                <MessageBarBody>
                  {existing.rows.length} {t('descriptions are loaded for this Device (')}{existing.fileName}{t('). Importing again replaces them.')}</MessageBarBody>
              </MessageBar>
            )}

            <div className={styles.row}>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => void readFile(e.target.files?.[0])} />
              <Button icon={<DocumentArrowUp24Regular />} onClick={() => fileRef.current?.click()}>
                {t('Choose a .csv file')}</Button>
              {fileName && <Text className={styles.muted}>{fileName}</Text>}
            </div>

            <div className={styles.row}>
              <Text className={styles.muted}>{t('Download a template (one measuring point, 162 indicators, English and Hungarian):')}</Text>
              <Button as="a" href="/templates/description-template-pump-162.csv" download icon={<ArrowDownload24Regular />}>
                {t('Template: pump')}</Button>
              <Button as="a" href="/templates/description-template-fan-162.csv" download icon={<ArrowDownload24Regular />}>
                {t('Template: fan')}</Button>
              <Button appearance="subtle" icon={<TextDescription24Regular />} aria-expanded={legendOpen} onClick={() => setLegendOpen(!legendOpen)}>
                {legendOpen ? t('Hide the formatting legend') : t('Formatting legend')}
              </Button>
            </div>
            <Text size={200} className={styles.muted}>
              {t('The templates name the Sensors')}{' '}<code>metric_name_1</code> {t('... (measuring point 1); replace the')}{' '}<code>_1</code> {t('ending with')}{' '}<code>_2</code> {t('for a second point, or rename the rows to your Device\'s Sensor names.')}</Text>
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
                placeholder={DESCRIPTION_COLUMNS.join(',')}
              />
            </Field>

            {parsed && match && (
              <>
                {parsed.issues.length > 0 ? (
                  <MessageBar intent="error">
                    <MessageBarBody>
                      {parsed.issues.length} {t('problem(s) - nothing is imported until they are fixed:')}<ul className={styles.list}>
                        {parsed.issues.slice(0, MAX_LISTED).map((i) => (
                          <li key={`${i.line}-${i.message}`}>
                            {t('line')}{' '}{i.line}: {i.message}
                          </li>
                        ))}
                        {parsed.issues.length > MAX_LISTED && <li>{t('… and')}{' '}{parsed.issues.length - MAX_LISTED} {t('more')}</li>}
                      </ul>
                    </MessageBarBody>
                  </MessageBar>
                ) : (
                  <MessageBar intent={match.matched.length > 0 ? 'success' : 'warning'}>
                    <MessageBarBody>
                      {match.matched.length} {t('of')}{' '}{parsed.rows.length} {t('rows match a Sensor of this Device.')}{match.withoutDescription.length > 0 && t(' {0} Sensor(s) of the Device have no description.', match.withoutDescription.length)}
                    </MessageBarBody>
                  </MessageBar>
                )}
                {match.unknown.length > 0 && (
                  <MessageBar intent="warning">
                    <MessageBarBody>
                      {match.unknown.length} {t('row(s) name a Sensor this Device does not have and are ignored (for example')}{' '}{match.unknown.slice(0, 3).join(', ')}{t('). Is this the sheet of another Device?')}</MessageBarBody>
                  </MessageBar>
                )}
                {parsed.ignoredColumns.length > 0 && <Text className={styles.muted}>{t('Ignored column(s):')}{' '}{parsed.ignoredColumns.join(', ')}</Text>}
              </>
            )}
          </DialogContent>
          <DialogActions>
            {existing && (
              <Button appearance="subtle" onClick={remove}>
                {t('Remove the loaded descriptions')}</Button>
            )}
            <Button appearance="secondary" onClick={onClose}>
              {t('Cancel')}</Button>
            <Button appearance="primary" disabled={!canApply} onClick={apply}>
              {t('Import')}{' '}{match && match.matched.length > 0 ? match.matched.length : ''} {t('descriptions')}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
