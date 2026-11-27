import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AggregationSelect } from './AggregationSelect';
import { setLanguage } from '@/lib/language';
import type { AggregationLevel } from '@/lib/aggregationLevels';

const LEVELS = [
  { key: 'd', label: '1 day · Average', calculationEnabled: true },
  { key: 'w', label: '1 week · Average', calculationEnabled: false },
] as unknown as AggregationLevel[];

const show = (rawCalculationOff?: boolean) =>
  render(
    <FluentProvider theme={webLightTheme}>
      <AggregationSelect levels={LEVELS} value="" onChange={() => undefined} rawCalculationOff={rawCalculationOff} />
    </FluentProvider>,
  );

beforeEach(() => setLanguage('en'));

describe('AggregationSelect', () => {
  it('marks every choice whose calculation is off - also "Raw readings"', () => {
    show(true);
    expect(screen.getByRole('option', { name: 'Raw readings · Calculation off' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1 week · Average · Calculation off' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '1 day · Average' })).toBeInTheDocument();
  });

  it('leaves "Raw readings" plain while the raw calculation is on', () => {
    show();
    expect(screen.getByRole('option', { name: 'Raw readings' })).toBeInTheDocument();
  });
});
