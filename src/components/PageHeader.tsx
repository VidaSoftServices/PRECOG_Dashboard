import type { ReactNode } from 'react';
import { Title2, Subtitle1, Text, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  // No visible title (or only a small one): the breadcrumb above already says which page this is, so the top of the page is just a slim row.
  rootCompact: {
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalS,
  },
  titles: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  // Not shown, but still the page's heading for a screen reader (the usual "visually hidden" technique, never display: none).
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
});

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** 'h2' for a page's secondary PageHeader (e.g. a sub-section) so a page with more than one doesn't end up with two <h1>s. */
  level?: 'h1' | 'h2';
  /**
   * How an 'h1' title is shown. 'hidden' (the default): not on screen - the breadcrumb already names the page - but still the page's
   * heading for assistive technology. 'compact': a small one-line heading (Subtitle1), for a page whose title is a name the breadcrumb does not carry
   * (a Device, an Issue, a Sensor). 'large': the full-size title, for a page without a breadcrumb (the Overview). A secondary 'h2' header
   * is always shown.
   */
  titleDisplay?: 'hidden' | 'compact' | 'large';
}

export function PageHeader({ title, description, actions, level = 'h1', titleDisplay = 'hidden' }: PageHeaderProps) {
  const styles = useStyles();
  const hidden = level === 'h1' && titleDisplay === 'hidden';
  // Everything except the full-size title (and a sub-section's h2) sits in a slim row.
  const slim = level === 'h1' && titleDisplay !== 'large';
  const Heading = level;

  // Fluent's Title2/Title3 control visual size only - `as` is required to get an actual semantic heading level out of them.
  let heading: ReactNode;
  if (hidden) heading = <Heading className={styles.visuallyHidden}>{title}</Heading>;
  else if (level === 'h1' && titleDisplay === 'compact') heading = <Subtitle1 as={level}>{title}</Subtitle1>;
  else heading = <Title2 as={level}>{title}</Title2>;

  // Without a visible title, no description and no actions there is nothing to lay out: just the (hidden) heading.
  if (hidden && !description && !actions) return heading;

  return (
    <div className={`${styles.root} ${slim ? styles.rootCompact : ''}`.trim()}>
      <div className={styles.titles}>
        {heading}
        {description && (
          <Text size={hidden ? 200 : 300} style={{ color: tokens.colorNeutralForeground3 }}>
            {description}
          </Text>
        )}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
