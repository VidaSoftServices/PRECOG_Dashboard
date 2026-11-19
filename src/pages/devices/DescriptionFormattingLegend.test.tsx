import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DescriptionFormattingLegend } from './DescriptionFormattingLegend';

describe('DescriptionFormattingLegend', () => {
  it('shows what to write next to what you get, drawn by the real renderer', () => {
    const { container } = render(
      <FluentProvider theme={webLightTheme}>
        <DescriptionFormattingLegend />
      </FluentProvider>,
    );
    expect(screen.getByRole('table', { name: 'How to format the description text' })).toBeInTheDocument();
    expect(container.querySelector('strong')?.textContent).toBe('bold text');
    expect(container.querySelector('em')?.textContent).toBe('italic text');
    expect(container.querySelectorAll('h3')).toHaveLength(1);
    expect(container.querySelectorAll('h4')).toHaveLength(1);
    expect(container.querySelector('a[href="https://vidasoftservices.com"]')).not.toBeNull();
    expect(container.querySelectorAll('li').length).toBe(4);
    expect(container.querySelector('hr')).not.toBeNull();
  });
});
