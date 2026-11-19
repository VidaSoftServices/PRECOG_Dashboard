import { type ReactNode } from 'react';
import { Button, Caption1, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { ChevronLeft16Regular, ChevronRight16Regular } from '@fluentui/react-icons';
import { isSafeHttpsUrl } from '@/lib/safeExternalUrl';
import { parseMarkdown, type Block, type Inline } from '@/lib/markdownLite';
import type { FoundDescription } from '@/lib/useSensorDescriptions';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  text: { color: tokens.colorNeutralForeground1, fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300, overflowWrap: 'anywhere' },
  h1: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, margin: `${tokens.spacingVerticalM} 0 ${tokens.spacingVerticalXS}` },
  h2: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, margin: `${tokens.spacingVerticalM} 0 ${tokens.spacingVerticalXS}` },
  h3: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, margin: `${tokens.spacingVerticalS} 0 ${tokens.spacingVerticalXXS}` },
  p: { margin: `0 0 ${tokens.spacingVerticalS}` },
  list: { margin: `0 0 ${tokens.spacingVerticalS}`, paddingLeft: tokens.spacingHorizontalXL },
  quote: {
    margin: `0 0 ${tokens.spacingVerticalS}`,
    paddingLeft: tokens.spacingHorizontalM,
    borderLeft: `${tokens.strokeWidthThicker} solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground2,
  },
  code: { fontFamily: tokens.fontFamilyMonospace, backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusSmall, padding: '0 3px' },
  rule: { border: 'none', borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, margin: `${tokens.spacingVerticalM} 0` },
  muted: { color: tokens.colorNeutralForeground3 },
  entries: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  entry: { display: 'flex', flexDirection: 'column' },
  entryDivider: { borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, paddingTop: tokens.spacingVerticalM },
  beside: { display: 'flex', alignItems: 'flex-start' },
  besideChart: { flexGrow: 1, minWidth: 0, marginRight: tokens.spacingHorizontalS },
  // A tab on the right edge (closed) or on the panel's left separator line (open; it sits right before the panel), vertically centred
  // (brand = the VidaSoft blue of the theme).
  edgeTab: {
    alignSelf: 'center',
    flexShrink: 0,
    minWidth: 0,
    width: '18px',
    height: '72px',
    padding: 0,
    borderRadius: `${tokens.borderRadiusLarge} 0 0 ${tokens.borderRadiusLarge}`,
  },
  besidePanel: {
    width: '360px',
    flexShrink: 0,
    overflowY: 'auto',
    boxSizing: 'border-box',
    // Same empty space on both sides of the line: chart -> line is the tab (18px) + the chart's 8px margin, line -> text is this padding.
    paddingLeft: `calc(18px + ${tokens.spacingHorizontalS})`,
    borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
});

function Inlines({ nodes }: Readonly<{ nodes: readonly Inline[] }>) {
  const styles = useStyles();
  return (
    <>
      {nodes.map((n, i) => {
        const key = `${i}-${n.t}`;
        switch (n.t) {
          case 'text':
            return n.v;
          case 'bold':
            return (
              <strong key={key}>
                <Inlines nodes={n.c} />
              </strong>
            );
          case 'italic':
            return (
              <em key={key}>
                <Inlines nodes={n.c} />
              </em>
            );
          case 'code':
            return (
              <code key={key} className={styles.code}>
                {n.v}
              </code>
            );
          case 'link':
            return isSafeHttpsUrl(n.href) ? (
              <a key={key} href={n.href} target="_blank" rel="noopener noreferrer">
                <Inlines nodes={n.c} />
              </a>
            ) : (
              <Inlines key={key} nodes={n.c} />
            );
        }
      })}
    </>
  );
}

function BlockView({ block }: Readonly<{ block: Block }>) {
  const styles = useStyles();
  switch (block.t) {
    case 'heading': {
      // Semantic level stays below the page's h1/h2 (the dialog title): h3 and h4 only; the look follows the markdown level.
      const Tag = block.level <= 2 ? 'h3' : 'h4';
      return (
        <Tag className={block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3}>
          <Inlines nodes={block.c} />
        </Tag>
      );
    }
    case 'p':
      return (
        <p className={styles.p}>
          <Inlines nodes={block.c} />
        </p>
      );
    case 'ul':
    case 'ol': {
      const List = block.t;
      return (
        <List className={styles.list}>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines nodes={item} />
            </li>
          ))}
        </List>
      );
    }
    case 'quote':
      return (
        <blockquote className={styles.quote}>
          <Inlines nodes={block.c} />
        </blockquote>
      );
    case 'hr':
      return <hr className={styles.rule} />;
  }
}

/** Renders the Azure DevOps markdown basics of a description as React elements (never as HTML). */
export function MarkdownText({ text }: Readonly<{ text: string }>) {
  const styles = useStyles();
  return (
    <div className={styles.text}>
      {parseMarkdown(text).map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

/** The descriptions of the found Sensors, one after the other (a Device/Sensor label above each when several are shown). Renders nothing for an empty list. */
export function SensorDescriptionList({ found, className }: Readonly<{ found: readonly FoundDescription[]; className?: string }>) {
  const styles = useStyles();
  if (found.length === 0) return null;
  return (
    <div className={mergeClasses(styles.entries, className)}>
      {found.map(({ row, label }, i) => (
        <article key={`${label ?? ''}|${row.sensorName}`} className={mergeClasses(styles.entry, i > 0 && styles.entryDivider)} aria-label={label ?? row.sensorName}>
          {label && <Caption1 className={styles.muted}>{label}</Caption1>}
          <MarkdownText text={row.description} />
        </article>
      ))}
    </div>
  );
}

/**
 * The enlarged chart with its description on the right. When a description exists, a blue edge tab with a "<" sits at the right side of
 * the chart; clicking it opens the panel beside the chart (the tab then sits on the separator line, shows ">" and closes it again).
 * No description = no tab and the chart keeps the full width. The panel is as tall as the chart and scrolls inside itself.
 */
export function ChartWithDescription({
  found,
  open,
  onToggle,
  height,
  children,
}: Readonly<{
  found: readonly FoundDescription[];
  open: boolean;
  onToggle: () => void;
  height: string;
  children: ReactNode;
}>) {
  const t = useT();
  const styles = useStyles();
  const hasDescription = found.length > 0;
  return (
    <div className={styles.beside}>
      <div className={styles.besideChart}>{children}</div>
      {hasDescription && (
        <Tooltip content={open ? t('Hide the description') : t('About this indicator')} relationship="label">
          <Button
            appearance="primary"
            className={styles.edgeTab}
            icon={open ? <ChevronRight16Regular /> : <ChevronLeft16Regular />}
            aria-label={open ? t('Hide the description') : t('Show the description')}
            aria-expanded={open}
            onClick={onToggle}
          />
        </Tooltip>
      )}
      {hasDescription && open && (
        <aside className={styles.besidePanel} style={{ maxHeight: height }} aria-label={t('About this indicator')}>
          <SensorDescriptionList found={found} />
        </aside>
      )}
    </div>
  );
}
