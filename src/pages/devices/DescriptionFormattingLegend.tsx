import { makeStyles, tokens } from '@fluentui/react-components';
import { MarkdownText } from '@/components/SensorDescription';

const useStyles = makeStyles({
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200 },
  th: { textAlign: 'left', padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightSemibold },
  cell: { verticalAlign: 'top', padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`, borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  write: {
    margin: 0,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  note: { margin: `${tokens.spacingVerticalS} 0 0`, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

/** What to write (left) and how it looks in the description (right - drawn by the same renderer the charts use). */
const EXAMPLES: ReadonlyArray<{ write: string; note?: string }> = [
  { write: '## Heading', note: 'A section heading (the large one).' },
  { write: '### Smaller heading', note: 'A sub-heading, for example "Can point to".' },
  { write: '**bold text**', note: 'Bold.' },
  { write: '_italic text_', note: 'Italic (also *italic*). Underscores inside a name such as my_sensor_x stay as they are.' },
  { write: '`code`', note: 'A name or value in a monospace font.' },
  { write: '- first point\n- second point', note: 'A bulleted list (also * or +).' },
  { write: '1. first step\n2. second step', note: 'A numbered list.' },
  { write: '> a remark', note: 'A quote or remark.' },
  { write: '---', note: 'A horizontal line.' },
  { write: '[VidaSoft](https://vidasoftservices.com)', note: 'A link; only https addresses become links.' },
  { write: 'one paragraph\n\nanother paragraph', note: 'A blank line starts a new paragraph; a plain line break inside a paragraph joins the lines.' },
  { write: '\\*not italic\\*', note: 'A backslash before a character shows it as written.' },
];

/** The "legend" of the Import descriptions page: every way to decorate the text, with the result next to it. */
export function DescriptionFormattingLegend() {
  const styles = useStyles();
  return (
    <div>
      <table className={styles.table} aria-label="How to format the description text">
        <thead>
          <tr>
            <th className={styles.th}>You write</th>
            <th className={styles.th}>You get</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLES.map((e) => (
            <tr key={e.write}>
              <td className={styles.cell}>
                <pre className={styles.write}>{e.write}</pre>
              </td>
              <td className={styles.cell}>
                <MarkdownText text={e.write} />
                {e.note && <p className={styles.note}>{e.note}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>
        In a .csv file put the whole description in double quotes when it has line breaks or commas, and write a quote inside it twice (&quot;&quot;). The text
        is shown as formatted text only - HTML tags are not interpreted. At most 8000 characters per description.
      </p>
    </div>
  );
}
