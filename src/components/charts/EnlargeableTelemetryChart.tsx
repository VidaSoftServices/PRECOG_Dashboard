import { useState, type ReactNode } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Text, makeStyles, tokens } from '@fluentui/react-components';
import { FullScreenMaximize16Regular } from '@fluentui/react-icons';
import { ChartWithDescription } from '@/components/SensorDescription';
import { useSensorDescriptions, type DescribedSensor } from '@/lib/useSensorDescriptions';
import { TelemetryChart, type TelemetryChartProps } from './TelemetryChart';
import { useT } from '@/lib/language';
import { useArrowStep } from '@/lib/useArrowStep';

const useStyles = makeStyles({
  // Larger than the Live Monitoring modal (85vw): a long-range analysis chart needs the room (about 5% of the window stays free).
  surface: { width: '95vw', maxWidth: '95vw' },
  bar: { display: 'flex', justifyContent: 'flex-end' },
});

const CHART_HEIGHT = 'calc(92vh - 200px)';

/**
 * A TelemetryChart that can be opened large in a modal window: by clicking the chart (not its legend, which keeps toggling
 * series) or with the Enlarge button, which is the keyboard and screen-reader route. The modal draws the same series with a
 * full yy-MM-dd HH:mm:ss time axis and an enlarged hover marker.
 */
export function EnlargeableTelemetryChart({
  title,
  describedSensors,
  open: openProp,
  onOpenChange,
  onStep,
  titleAction,
  ...chart
}: TelemetryChartProps & {
  title: string;
  /** Controlled open state (the page keeps the window open while it loads the next Sensor); without it the chart manages it itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Up / Down arrow in the open window: -1 = the previous Sensor, +1 = the next one. Without it the arrows do nothing. */
  onStep?: (delta: -1 | 1) => void;
  /** Shown at the top right of the large window, before the close button (the aggregation picker of Smart Analytics). */
  titleAction?: ReactNode;
  /** Sensors whose imported description opens beside the enlarged chart with the "?" button; none imported = no button. */
  describedSensors?: readonly DescribedSensor[];
}) {
  const t = useT();
  const styles = useStyles();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  useArrowStep(open, onStep);
  const found = useSensorDescriptions(describedSensors, open);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <div className={styles.bar}>
        <Button
          appearance="subtle"
          size="small"
          icon={<FullScreenMaximize16Regular />}
          aria-label={t('Enlarge chart: {0}', title)}
          title={t('Open the chart in a large window')}
          onClick={() => setOpen(true)}
        />
      </div>
      <TelemetryChart {...chart} onEnlarge={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
        <DialogSurface className={styles.surface}>
          <DialogBody>
            <DialogTitle action={titleAction ? <div>{titleAction}</div> : undefined}>{title}</DialogTitle>
            <DialogContent style={{ paddingTop: tokens.spacingVerticalS }}>
              {/* Only built while open: a closed dialog renders nothing, so no second chart sits in the page. */}
              <ChartWithDescription found={found} open={showInfo} onToggle={() => setShowInfo(!showInfo)} height={CHART_HEIGHT}>
                <TelemetryChart {...chart} height={CHART_HEIGHT} timeAxis="fullDateTime" emphasizeHover onEnlarge={undefined} />
              </ChartWithDescription>
            </DialogContent>
            <DialogActions>
              {onStep && (
                <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginRight: 'auto' }}>
                  {t('Up / Down arrow: previous / next Sensor')}</Text>
              )}
              <Button appearance="primary" onClick={() => setOpen(false)}>
                {t('Close')}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
