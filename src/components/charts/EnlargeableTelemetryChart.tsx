import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, makeStyles, tokens } from '@fluentui/react-components';
import { FullScreenMaximize16Regular } from '@fluentui/react-icons';
import { TelemetryChart, type TelemetryChartProps } from './TelemetryChart';

const useStyles = makeStyles({
  // Larger than the Live Monitoring modal (85vw): a long-range analysis chart needs the room (about 5% of the window stays free).
  surface: { width: '95vw', maxWidth: '95vw' },
  bar: { display: 'flex', justifyContent: 'flex-end' },
});

/**
 * A TelemetryChart that can be opened large in a modal window: by clicking the chart (not its legend, which keeps toggling
 * series) or with the Enlarge button, which is the keyboard and screen-reader route. The modal draws the same series with a
 * full yy-MM-dd HH:mm:ss time axis and an enlarged hover marker.
 */
export function EnlargeableTelemetryChart({ title, ...chart }: TelemetryChartProps & { title: string }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className={styles.bar}>
        <Button
          appearance="subtle"
          size="small"
          icon={<FullScreenMaximize16Regular />}
          aria-label={`Enlarge chart: ${title}`}
          title="Open the chart in a large window"
          onClick={() => setOpen(true)}
        />
      </div>
      <TelemetryChart {...chart} onEnlarge={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
        <DialogSurface className={styles.surface}>
          <DialogBody>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent style={{ paddingTop: tokens.spacingVerticalS }}>
              {/* Only built while open: a closed dialog renders nothing, so no second chart sits in the page. */}
              <TelemetryChart {...chart} height="calc(92vh - 200px)" timeAxis="fullDateTime" emphasizeHover onEnlarge={undefined} />
            </DialogContent>
            <DialogActions>
              <Button appearance="primary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
